var _cluster		= require('cluster');
var _os				= require('os');
var _ 				= require('underscore');
var _qs 			= require('querystring');
var _http 			= require('./lib.httpserver').httpserver;
var _logger 		= require('./lib.logger').logger;
var _datastore 		= require('./lib.datastore').datastore;
var _mysql			= require('mysql');
var uuid 			= require('./lib.uuid');
var reporter 		= require('./lib.reporter').reporter;

var client 			= require('./node.awsi').client;
var server 			= require('./node.awsi').server;

var debug_mode		= false;

function operator() {
	
	this.options = _.extend({
		cylon_host:	"127.0.0.1",
		cylon_port:	8024,
		http_port:	8020,
		port:		8022
	},this.processArgs());
	
	this.logger = new _logger({label:'Operator:'+process.pid});
	var scope = this;
}

operator.prototype.init = function() {
	var scope = this;
	
	scope.mongo = new _datastore({
		database:		"fleetwit"
	});
	scope.mongo.init(function() {
		scope.mysql = _mysql.createConnection({
			host     : 'localhost',
			user     : 'root',
			password : '',
			database : 'fleetwit'
		});
		scope.mysql.connect(function(err) {
			scope.serverInit();
		});
	});
}
operator.prototype.processArgs = function() {
	var i;
	var args 	= process.argv.slice(2);
	var output 	= {};
	for (i=0;i<args.length;i++) {
		var l1	= args[i].substr(0,1);
		if (l1 == "-") {
			if (args[i+1] == "true") {
				args[i+1] = true;
			}
			if (args[i+1] == "false") {
				args[i+1] = false;
			}
			if (!isNaN(args[i+1]*1)) {
				args[i+1] = args[i+1]*1;
			}
			output[args[i].substr(1)] = args[i+1];
			i++;
		}
	}
	return output;
};
operator.prototype.serverInit = function() {
	var scope = this;
	/*this.logger.error("HTTP Server Starting");
	this.server	= new _http({
		port:		this.port,
		mysql:		this.mysql,
		onRequest:	function(params, instance, server) {
			//instance.output(server, params, true, true);
			if (instance.requireParameters(server, params, ["authtoken","rid"])) {
				instance.validateAuthToken(server, params, function(success, data) {
					//scope.logger.info(success, data);
					if (success) {
						
						// Get the raceToken
						scope.getRaceToken(data.id, params.rid, function(raceToken) {
							//scope.logger.log("raceToken: ",raceToken);
							instance.output(server, {
								raceToken:	raceToken,
								cylon:		{
									host:	scope.options.cylon_host,
									port:	scope.options.cylon_port
								}
							}, true);
						});
						
					}
					// fail is already handled by the httpserver
				});
			}
		}
	});*/
	this.logger.error("Socket Server Starting");
	this.server 	= new server({
		port:		scope.options.port,
		onConnect:	function(wsid) {
			console.log("hello!",wsid);
			scope.server.send(wsid, {
				hello: wsid
			});
		},
		onReceive:	function(wsid, data, flag) {
			if (data.authToken) {
				scope.mysql.query("select u.id,u.email,u.firstname,u.lastname,t.token,t.validity from authtokens as t, users as u where u.id=t.uid and t.token='"+data.authToken+"' and t.validity > "+(new Date().getTime()/1000), function(err, rows, fields) {
					if (rows.length > 0 && rows[0].id > 0) {
						
						scope.getRaceToken(rows[0].id, data.rid, function(raceToken) {
							
							var response = {
								raceToken:	raceToken,
								cylon:		{
									host:	scope.options.cylon_host,
									port:	scope.options.cylon_port
								}
							};
							if (data.ask_id) {
								response.response_id = data.ask_id;
							}
							if (data.send_time) {
								response.send_time = data.send_time;
							}
							scope.server.send(wsid, response);
						});
					} else {
						
						var response = {invalidtoken: true};
						if (data.ask_id) {
							response.response_id = data.ask_id;
						}
						if (data.send_time) {
							response.send_time = data.send_time;
						}
						scope.server.send(wsid, response);
					}
				});
			}
		},
		onClose:	function(wsid) {
			
		}
	});
	
	
	/*
	this.reporter = new reporter({
		label:		"operator",
		onRequest:	function() {
			return {
				cpu: 	_os.cpus()[0].times,
				mem:	process.memoryUsage(),
				totalmem:	_os.totalmem(),
				freemem:	_os.freemem(),
				count:	scope.wsserver.count,
				ocount:	scope.wsserver.ocount
			};
		}
	});*/
}
operator.prototype.getRaceToken = function(uid, rid, callback) {
	var scope = this;
	// Check if the user already has a raceToken
	this.mysql.query("select * from races_scores where uid="+uid+" and rid="+rid+" and racetoken <> ''", function(err, rows, fields) {
		if (rows.length > 0 && rows[0].id > 0) {
			// We have a raceToken, we return it
			callback(rows[0].racetoken);
		} else {
			// no raceToken, we need to create it
			var raceToken = uuid.v4();
			// save the raceToken
			scope.mysql.query("insert into races_scores (rid,uid,racetoken) values("+rid+","+uid+",'"+raceToken+"')", function(err, rows, fields) {
				callback(raceToken);
			});
		}
	});
}

var instance = new operator();
instance.init();

/************************************/
/************************************/
/************************************/
// Process Monitoring
setInterval(function() {
	process.send({
		memory:		process.memoryUsage(),
		process:	process.pid
	});
}, 1000);

// Crash Management
if (!debug_mode) {
	process.on('uncaughtException', function(err) {
		console.log("uncaughtException",err);
	});
}


