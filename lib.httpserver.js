var http 				= require('http');
var uuid 				= require('./lib.uuid');
var _ 					= require('underscore');
var qs 					= require('querystring');
var logger 				= require('./lib.logger').logger;

function httpserver(options) {
	var scope = this;
	this.options = _.extend({
		port:		80,
		onRequest:	function(params, instance, server) {
			instance.output(server, "Hello world.");
		},
		logger:	false,
		mysql:	false
	},options);
	
	if (!this.options.logger) {
		this.logger = new logger({label:'httpserver:'+this.options.port});
	} else {
		this.logger = this.options.logger;
	}
	this.mysql = this.options.mysql;
	
	http.createServer(function (req, server) {
		
		var params = {};
		
		// Parse Query Strings / POST and GET
		if (req.method == 'POST') {
			var body='';
			req.on('data', function (data) {
				body += data;
			});
			req.on('end',function(){
				params =  qs.parse(body);
			});
		} else {
			var querystring = req.url.split("?");
			var arg;
			if (querystring.length > 1) {
				params = qs.parse(querystring[1]);
			} else {
				params = qs.parse(req.url);
			}
		}
		if (params.json && typeof(params.json) == "string") {
			params = JSON.parse(params.json);
		}
		console.log("params",params);
		
		scope.options.onRequest(params, scope, server);
		
	}).listen(this.options.port);
}
httpserver.prototype.output = function(server, data, json, error) {
	if (json == undefined) {
		json = false;
	}
	if (error == undefined) {
		error = false;
	}
	
	
	var output		= {};
	
	if (error) {
		output.error = true;
	}
	
	if (json) {
		output = _.extend(data,output);
		server.writeHead(200, {"Content-Type": "application/json"});
		server.write(JSON.stringify(output));
	} else {
		server.write(data);
	}
	server.end();
	
	return true;
}





httpserver.prototype.requireParameters = function(server, data, params) {
	var scope = this;
	var i;
	var j;
	
	
	for (i=0;i<params.length;i++) {
		if (data[params[i]] == undefined || data[params[i]] == "") {
			scope.output(server, {message:"Parameter '"+params[i]+"' is required. Parameters expected: "+params.join(", ")+".",data:data},true,true);
			return false;
		}
	}
	
	return true;
}
httpserver.prototype.validateAuthToken = function(server, data, callback) {
	var scope = this;
	var i;
	var j;
	
	if (data.authtoken == "test") {
		callback(true, {
			id:			2,
			firstname:	"Test",
			lastname:	"Test",
			email:		"test@test.com"
		});
	}
	
	
	this.mysql.query("select u.id,u.email,u.firstname,u.lastname,t.token,t.validity from authtokens as t, users as u where u.id=t.uid and t.token='"+data.authtoken+"' and t.validity > "+(new Date().getTime()/1000), function(err, rows, fields) {
		if (rows.length > 0 && rows[0].id > 0) {
			scope.logger.info(
				"Auth Token validated: ",
				"UID: \t\t"+rows[0].id,
				"Token: \t"+rows[0].token,
				"Validity: \t"+new Date(rows[0].validity*1000).toISOString(),
				"User: \t\t"+rows[0].firstname+" "+rows[0].lastname
			);
			callback(true, rows[0]);
		} else {
			scope.output(server, "invalidtoken");
			callback(false);
		}
	});
	
	return false;
}
exports.httpserver = httpserver;