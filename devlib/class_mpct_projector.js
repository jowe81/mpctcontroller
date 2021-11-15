/*
 * Modified 2019-11-14
 * 
 * Control a projector via PJLINK
 * 
 * PJLINK default port is 4352
 * PJLINK info at https://pjlink.jbmia.or.jp/english/data/5-1_PJLink_eng_20131210.pdf
 * 
 * method=0 -> commands via pjlink only
 * method=1 -> commands via pjlink and http
 * method=2 -> commands via http only
 */

/*
 *	Device config examples (config.json):
 * 

		{	"physical":{"type":"projector","ip":"192.168.1.131","port":4352},		
			"meta":{"group":"projectors","name":"Left"},		
            "config":{
            	"reportingInterval":10000,
            	"reportInactiveIntervals":true,
            	"password":"panasonic",
            	"httpOn":"http://admin1:panasonic@192.168.1.200/~johannes/c.php?CTL=fon&KEY=1568246401588",
            	"httpOff":"http://admin1:panasonic@192.168.7.191/base_conf.htm?CTL=foff&KEY=1568246401588",
            	"method":1,
            	"pjlinkParams":["mute","errors","lamps","input","name","model","powerState"],
            	"availablePjlinkParams":["mute","errors","lamps","inputs","input","name","manufacturer","model","powerState"]            	            	            	
            }
		}


*/

/*
 * Device params:
 * 		
 */
var _=require('lodash');
var pjlink = require('pjlink');
var request = require('request');

var intervalHandler;


function Mpct_projector(device,log,publishDeviceStatus){
	//Device record
	this.device=device; 
	//If reportingInterval is missing, default to 10s
	if (!this.device.config.reportingInterval){
		this.device.config.reportingInterval=10000;
	}
	//Functions
	this.log=log;
	this.publishDeviceStatus=publishDeviceStatus;
	this.log("Initializing projector "+device.physical.uid+" at "+device.physical.ip+":"+device.physical.port,"pjlink");
	//Check for pjlink parameters
	if (!this.device.config.pjlinkParams){
		this.log("pjlinkParams for "+device.physical.uid+" are missing, defaulting to all","pjlink",true);
		this.device.config.pjlinkParams=["mute","errors","lamps","inputs","input","name","manufacturer","model","powerState"];
	} else {
		this.log("pjlinkParams for "+device.physical.uid+" found ("+this.device.config.pjlinkParams.length+")","pjlink",false);				
	}
	//Check for connection method setting
	if (!this.device.config.hasOwnProperty("method")){
		//No connection method given, default to PJLINK (0=pjlink only, 1=http and pjlink, 2=http only)
		this.device.config.method=0;
	}
	//Init status data
	this.device.data.status={};
	this.device.error=true; //Init with error=true while waiting for successful read
	this.haveOpenRequest=false;
	//Set interval timer for reporting
	this.setReportingInterval(function(proj){		
		//Reporting interval has expired: send report
		proj.read(function(device,err,change){
			if (err){
				publishDeviceStatus(proj.device,true);
			} else if (proj.device.config.reportInactiveIntervals || change){
				publishDeviceStatus(proj.device);					
			}
		});
	});		
	this.connect();
}

Mpct_projector.prototype.connect=function(){
	this.log("Attempting to connect to projector "+this.device.physical.uid+" at "+this.device.physical.ip+":"+this.device.physical.port,"pjlink");
	var projector=new pjlink(this.device.physical.ip,this.device.physical.port, this.device.config.password);
	this.projector=projector;
	//Store timestamp for when initial connection was (probably) established
	this.device.physical.connectedSince=new Date().getTime();
	//Store timestamp from last projector response 
	this.device.physical.lastResponse=this.device.physical.connectedSince;	
}


Mpct_projector.prototype.read=function(callback,noCallbackTimer){
  /*
   * Set callback timeout by default (don't wait for unresponsive projectors)
   */
  if (!(noCallbackTimer===true)){
	  setTimeout(function(){
		  callback(this.device);
	  },1500);
  }
	
  var ths=this;  
  var projector=this.projector;
  var responseTimeout=60000;//this.device.config.responseTimeout;
  var msSinceLastResponse=new Date().getTime()-this.device.physical.lastResponse;
 
  if (msSinceLastResponse<responseTimeout){
	  //Make reading attempt only if projector hasn't been unresponse
	  if (!this.device.data.pjlink) this.device.data.pjlink={};
	  
	  if (!this.haveOpenRequest){
		  //this.device.error=false;
		  
		  var paramsToRead=0; //number of parameters to read from pjlink (device.config.pjlinkParams)
		  
		  this.haveOpenRequest=true;
		  //Make a bunch of requests from the projector and use _.after() to wait for them to complete, then execute callback
		  //console.log("Starting requests");
		  
		  if (this.device.config.pjlinkParams.indexOf("mute")!=-1){
			  paramsToRead++;
			  projector.getMute(function(err, state){
					//console.log('mute', err, state);
					if (err && err.code !== 'ETIMEDOUT') {
						ths.device.error=true;
						ths.haveOpenRequest=false;
					} else {
						//ths.device.data.pjlink.mute=mute;
						ths.device.data.pjlink.mute={};
						ths.device.data.pjlink.mute.video=state.video;								
						ths.device.data.pjlink.mute.audio=state.audio;			
					}
					done();
			  });			  
		  }

		  if (this.device.config.pjlinkParams.indexOf("mute")!=-1){
			  paramsToRead++;
			  projector.getErrors(function(err, errors){
				//console.log('errors', err, errors);
				if (err && err.code !== 'ETIMEDOUT') {
					ths.haveOpenRequest=false;
					done(true);
				} else {
					ths.device.data.pjlink.errors=errors;		
					done();
				}
			  });
		  }
		  
		  if (this.device.config.pjlinkParams.indexOf("lamps")!=-1){
			  paramsToRead++;
			  projector.getLamps(function(err, lamps){
			    //console.log('lamp', err, lamps);
				if (err && err.code !== 'ETIMEDOUT') {
					ths.haveOpenRequest=false;
					done(true);
				} else {
					ths.device.data.pjlink.lamps=lamps;		
					done();
				}
			  });
		  }

		  if (this.device.config.pjlinkParams.indexOf("inputs")!=-1){
			  paramsToRead++;
			  projector.getInputs(function(err, inputs){
				//console.log('inputs', err, inputs);
				if (err && err.code !== 'ETIMEDOUT') {
					ths.haveOpenRequest=false;
					done(true);
				} else {
					ths.device.data.pjlink.inputs=inputs;			
					done();
				}
			  });
		  }

		  if (this.device.config.pjlinkParams.indexOf("input")!=-1){
			  paramsToRead++;
			  projector.getInput(function(err, input){
				//console.log('input', err, input);
				if (err && err.code !== 'ETIMEDOUT') {
					ths.haveOpenRequest=false;
					done(true);
				} else {
					ths.device.data.pjlink.input=input;			
					done();
				}
			  });
		  }

		  if (this.device.config.pjlinkParams.indexOf("name")!=-1){
			  paramsToRead++;
			  projector.getName(function(err, name){
				//console.log('name', err, name);
				if (err && err.code !== 'ETIMEDOUT') {
					ths.haveOpenRequest=false;
					done(true);
				} else {
					ths.device.data.pjlink.name=name;			
					done();
				}
			  });

		  }

		  if (this.device.config.pjlinkParams.indexOf("manufacturer")!=-1){
			  paramsToRead++;
			  projector.getManufacturer(function(err, manufacturer){
			    //console.log('manufacturer', err, manufacturer);
				if (err && err.code !== 'ETIMEDOUT') {
					ths.haveOpenRequest=false;
					done(true);
				} else {
					ths.device.data.pjlink.manufacturer=manufacturer;		
					done();
				}
			  });
		  }

		  if (this.device.config.pjlinkParams.indexOf("model")!=-1){
			  paramsToRead++;
			  projector.getModel(function(err, model){
				//console.log('model', err, model);
				if (err && err.code !== 'ETIMEDOUT') {
					ths.haveOpenRequest=false;
					done(true);
				} else {
					ths.device.data.pjlink.model=model;		
					done();
				}
			  });
		  }

		  if (this.device.config.pjlinkParams.indexOf("powerState")!=-1){			  
			  paramsToRead++;
			  projector.getPowerState(function(err, state){
				//console.log('power', err, state);
				//0 or 1 for powered off or on			
				if (err && err.code !== 'ETIMEDOUT') {
					ths.haveOpenRequest=false;
					done(true);
				} else {
					ths.device.data.pjlink.powerState=state; //0=off, 1=on, 2=cooling, 3=warmup
					ths.device.data.status={"value":state,"readAt":new Date().getTime()};
					done();
				}
			  });
		  }

		  this.log("Reading "+paramsToRead+" parameters from projector "+this.device.physical.uid+" at "+this.device.physical.ip+":"+this.device.physical.port,"pjlink");
		  
		  var done = _.after(paramsToRead, function(projectorError) {
			  //Success
			  ths.haveOpenRequest=false;
			  ths.device.physical.lastResponse=new Date().getTime();
			  if (projectorError){
				log("Error while reading from projector "+ths.device.physical.uid+" ("+paramsToRead+" parameters)","pjlink",true);
				ths.device.error=true;
			  } else {
				log("Done reading projector status for "+ths.device.physical.uid+ (" ("+paramsToRead+" params, connected "+((new Date().getTime()-ths.device.physical.connectedSince)/1000)+"s)"),"pjlink");
				ths.device.error=false;
			  }
			  //log("Connected "+((new Date().getTime()-ths.device.physical.connectedSince)/1000)+" seconds ago","pjlink");
		      //console.log(ths.device.data.pjlink);
			  //Callback has been commented out here because it is now timed (see top of function)
			  //if (callback)callback(ths.device);
		  });
		  
	  } else {
			log(""+ths.device.physical.uid+" has open request. Waiting.","pjlink");		  
	  }
	  
	  
  } else {
	  //Projector hasn't responded in the last while
	  log("Projector "+ths.device.physical.uid+" is unresponsive (since "+(msSinceLastResponse/1000)+"ms)","hardware",true);
	  this.device.data.pjlink={};
	  this.device.error=true;
      if (callback)callback(this.device);//Publish device data
      //this.projector.disconnect();
	  this.connect();
  }
	
	
  
  //this is probably useless
  return this.device.data.status;  
}

Mpct_projector.prototype.write=function(value){
	  var device=this.device;
	  var ths=this;
	  projector=this.projector;

	  //device.physical.method==0 => PJlink only, 1 => PJlink and http, 2 => http only
	  var methodlabel="pjlink";
	  if (device.config.method==1){
		  methodlabel="pjlink,http";
	  } else if (device.config.method==2){
		  methodlabel="http";
	  }
	  
	  if (value==1){
	  	  ths.log("Attempting to turn on projector "+device.physical.uid+" with method(s) "+methodlabel+" ("+device.config.method+")","pjlink");		  
		  if (device.config.method<2){
			  //PJlink
		  	  ths.log(device.physical.uid+" at "+device.physical.ip+":"+device.physical.port+": request power on","pjlink");		  
			  projector.powerOn(function(err){
			  	if(err){
			  		ths.log("Error turning on projector "+device.physical.uid+" at "+device.physical.ip+":"+device.physical.port,"pjlink",true);
			  		device.error=true;
			  	} else {
					ths.log("Turned on projector "+device.physical.uid+" at "+device.physical.ip+":"+device.physical.port,"pjlink");			
					ths.device.data.status={"readAt":new Date().getTime()};
					ths.device.data.pjlink.powerState=3; //Warmup
					device.error=false;
			  	}
				ths.publishDeviceStatus(device);
			  });			  
		  }
		  if (device.config.method>0){
			  //HTTP
			  ths.log("Sending httpOn request to projector "+device.physical.uid+": "+device.config.httpOn,"http");
			  request({
				  url: device.config.httpOn,
				  json: true
			  },
			  function (error, response, data) {
				  if (!error){
					ths.log(device.physical.uid+": httpOn request succeeded","http");
				  } else {
					ths.log(device.physical.uid+": httpOn request failed","http",true);
				  }
			  });			  
		  }
		  return true;
	  } else if (value==0) {
	  	  ths.log("Attempting to turn off projector "+device.physical.uid+" with method(s) "+methodlabel,"pjlink");		  
		  if (device.config.method<2){
			  //PJlink
		  	  ths.log(device.physical.uid+" at "+device.physical.ip+":"+device.physical.port+": request power off","pjlink");		  
			  projector.powerOff(function(err){
			  	if(err){
			  		ths.log("Error turning off projector "+device.physical.uid+" at "+device.physical.ip+":"+device.physical.port,"pjlink",true);
		     		device.error=true;
			  	} else {
					ths.log("Turned off projector "+device.physical.uid+" at "+device.physical.ip+":"+device.physical.port,"pjlink");
					ths.device.data.status={"readAt":new Date().getTime()};
					ths.device.data.pjlink.powerState=2; //Cooldown
		     		device.error=false;
			  	}
	     		ths.publishDeviceStatus(device);
			  });			 
		  }
		  if (device.config.method>0){
			  //HTTP
			  ths.log("Sending httpOff request to projector "+device.physical.uid+": "+device.config.httpOff,"http");			  
			  request({
				  url: device.config.httpOff,
				  json: true
			  },
			  function (error, response, data) {
				  if (!error){
					ths.log(device.physical.uid+": httpOff request succeeded","http");
				  } else {
					ths.log(device.physical.uid+": httpOff request failed","http",true);
				  }
			  });			  
		  }
		  return true;
	  }
	  //Projector is in cooling or warming state - no command issued
	  return false;
}

Mpct_projector.prototype.setShutter=function(video){
	var ths=this;
	//The setMute function in the pjlink lib is faulty - but this call works with tested version
	this.projector.setMute(video,function(err){
		var device=ths.device;
		if (err){
			ths.log("Couldn't set shutter (mute) for "+device.physical.uid+" at "+device.physical.ip+":"+device.physical.port,"pjlink",true);						
		} else {
			ths.log("Set shutter (mute) for "+device.physical.uid+" at "+device.physical.ip+":"+device.physical.port,"pjlink");
			ths.device.data.pjlink.mute.video=video;
     		ths.publishDeviceStatus(device);
		}
	});
}

Mpct_projector.prototype.execCommand=function(command,callback){
	//Check if forceWrite is set: write to device even if status isn't changing
	var forceWrite;
	var success=true;
	(command.data.hasOwnProperty("forceWrite") && command.data.forceWrite) ? forceWrite=true : forceWrite=false;
	if (command.data.hasOwnProperty("powerState")){
		//Only write if status is actually changing and not currently warming up or cooling down, or forceWrite=true
		if ((this.device.data.pjlink.powerState<2 && command.data.powerState!=this.device.data.pjlink.powerState) || forceWrite){
			success=this.write(command.data.powerState);			
		}
	}
	if (command.data.hasOwnProperty("mute")){
		if (command.data.mute.hasOwnProperty("video")){
			success=this.setShutter(command.data.mute.video);
		}
	}
	if (callback) callback(success);
}

//Use setInverval() to assign a callback to be executed at the given reporting interval
Mpct_projector.prototype.setReportingInterval=function (callback,newInterval){
	//Init pjlink data parameter
	if (!this.device.data.pjlink){
		this.device.data.pjlink={};		
	}
	//Clear old interval handler if exists
	if (this.intervalHandler){
		clearInterval(this.intervalHandler);
	}
	//Use specified interval if exists, or else default to device record
	if (newInterval){
		this.device.config.reportingInterval=newInterval;
	}
	//Don't allow for intervals shorter than minimum
	var t=Math.max(5000,this.device.config.reportingInterval);
	//Set new interval handler
	log("Setting reporting interval handler for "+this.device.physical.uid+" at "+t+" ms","hardware");
	var proj=this;
	this.intervalHandler=setInterval(function(){		
		if (callback) callback(proj);
	},t); 	
}


Mpct_projector.prototype.clearReportingInterval=function(command,callback){
	var device=this.device;
	//Clear old interval handler if exists
	if (this.intervalHandler){
		this.log("Clearing reporting for projector "+device.physical.uid+" at "+device.physical.ip+":"+device.physical.port,"hardware");
		clearInterval(this.intervalHandler);
	}	
	if (callback) callback();
}


module.exports=Mpct_projector;
