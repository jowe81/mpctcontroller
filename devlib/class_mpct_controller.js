/*
 * Controller data
 */

/*
 * 
 * Controller status live data in controller.system 
 * 
 * controller.system.uptimeProcess: seconds
 * controller.system.uptimeHost: seconds
 * 
 */
var diskusage=require('diskusage');
var os=require('os');

function Mpct_controller(controller,log,publishControllerStatus){
	//Device record
	this.controller=controller; 
	//Functions
	this.log=log;
	this.publishControllerStatus=publishControllerStatus;
	//Initialize...
	this.log("Initializing controller watch process for controller "+controller.controllerId,"system");
	//Init parameters
	this.controller.system={};
	this.controller.system.fsInfo={};
	if (!this.controller.reportingInterval){
		this.controller.reportingInterval=300000; //default to 5 minutes if not specified
	}
	//Set interval timer for reporting
	this.setReportingInterval(function(controllerInstance){		
		//Reporting interval has expired
		controllerInstance.read(function(){
			publishControllerStatus();
		});
	});		
}

//Use setInverval() to assign a callback to be executed at the given reporting interval
Mpct_controller.prototype.setReportingInterval=function (callback,newInterval){
	var controller=this.controller;
	var controllerInstance=this;
	//Clear old interval handler if exists
	if (this.intervalHandler){
		clearInterval(this.intervalHandler);
	}
	//Use specified interval if exists, or else default to device record
	if (newInterval){
		controller.reportingInterval=newInterval;
	}
	//Don't allow for intervals shorter than minimum
	var t=Math.max(5000,controller.reportingInterval);
	//Set new interval handler
	log("Setting reporting interval handler for controller "+controller.controllerId+" at "+t+" ms","system");
	this.intervalHandler=setInterval(function(){		
		if (callback) callback(controllerInstance);
	},t); 	
}

Mpct_controller.prototype.read=function(callback){
	controller=this.controller;
	//Synchronous data
	controller.system.uptimeProcess=process.uptime();
	controller.system.uptimeHost=os.uptime();
	//Asynchronous disk check
	diskusage.check("/", function(err, info) {
	    if (err) {
	    	log("Could not determine filesystem status","system",true);
	    	controller.system.fsInfo.bytesAvailable=false;
	    	controller.system.fsInfo.bytesFree=false;
	    	controller.system.fsInfo.bytesTotal=false;
	    } else {
	    	//info contains three properties: available, free, total
	    	controller.system.fsInfo.bytesAvailable=info.available;
	    	controller.system.fsInfo.bytesFree=info.free;
	    	controller.system.fsInfo.bytesTotal=info.total;
	    }
	    if (callback) callback();
	});	
}

Mpct_controller.prototype.clearReportingInterval=function(command,callback){
	//Clear old interval handler if exists
	if (this.intervalHandler){
		log("Clearing reporting for controller "+this.controller.controllerId,"system");
		clearInterval(this.intervalHandler);
	}	
	if (callback) callback();
}

	
module.exports=Mpct_controller;
