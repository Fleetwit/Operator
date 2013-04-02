var _cluster		= require('cluster');
var _os				= require('os');
var _ 				= require('underscore');
var _qs 			= require('querystring');
var _http 			= require('./lib.httpserver').httpserver;
var _logger 		= require('./lib.logger').logger;
var _datastore 		= require('./lib.datastore').datastore;
var _redis 			= require("redis");
var _mysql			= require('mysql');
var uuid 				= require('./lib.uuid');

var debug_mode		= true;

function operator() {
	this.port	= 8020;
	this.logger = new _logger({label:'Operator:'+process.pid});
	var scope = this;
}

operator.prototype.init = function() {
	var scope = this;
	scope.redis = _redis.createClient();
	scope.redis.select(0, function() {
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
	});
}
operator.prototype.serverInit = function() {
	var scope = this;
	this.logger.error("Server Starting");
	this.server	= new _http({
		port:		this.port,
		mysql:		this.mysql,
		onRequest:	function(params, instance, server) {
			//instance.output(server, params, true, true);
			if (instance.requireParameters(server, params, ["authtoken","rid"])) {
				instance.validateAuthToken(server, params, function(success, data) {
					scope.logger.info(success, data);
					if (success) {
						/*
						@TODO:
						CylonInstance = min(usercount) = {
							host,
							port
						}
						*/
						// Get the raceToken
						scope.getRaceToken(data.id, params.rid, function(raceToken) {
							scope.logger.log("raceToken: ",raceToken);
							instance.output(server, {
								raceToken:	raceToken,
								cylon:		{
									host:	'127.0.0.1',
									port:	8080
								}
							}, true);
						});
						
					}
					// fail is already handled by the httpserver
				});
			}
		}
	});
}
operator.prototype.getRaceToken = function(uid, rid, callback) {
	var scope = this;
	// Check if the user already has a raceToken
	this.mysql.query("select * from races_scores where uid="+uid+" and rid="+rid, function(err, rows, fields) {
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


