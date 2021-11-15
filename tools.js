module.exports=function(){

	var fs=require('fs');
	var errorLogStream=fs.createWriteStream("error.log", {flags:'a'});
	
	//Make sure required parameters exist
	this.verifyConfigJson=function(config){
		for (var i=0;i<config.devices.length;i++){
			//Each device needs an array of metadata
			if (!config.devices[i].physical){
				config.devices[i].physical={};
			}
			if (!config.devices[i].meta){
				config.devices[i].meta={};
			}
			if (!config.devices[i].config){
				config.devices[i].config={};
			}
			if (!config.devices[i].status){
				config.devices[i].status={};
			}
			if (!config.devices[i].data){
				config.devices[i].data={};
			}
		}
		return config;
	}

	this.readJson=function(filename,exitOnError){
		this.log("Attempting to read "+filename,"fs");
		try {
			targetObject=JSON.parse(fs.readFileSync(filename));
			log("Read "+filename+" successfully","fs");
			return targetObject;
		} catch (err) {
			log("Failed to read "+filename+" ("+err+")","fs",true);
			if (exitOnError){
				log("Exiting...Goodbye!","system");			
				process.exit(1);				
			}
		}		
	}
		
	this.readConfigJson=function(config){
		this.log("Attempting to read configuration file ./config.json","init");
		try {
			config=JSON.parse(fs.readFileSync("config.json"));
			config=this.verifyConfigJson(config);
			log("Read config.json successfully","init");
			return config;
		} catch (err) {
			log("Failed to read config.json ("+err+")","fs",true);
			log("Exiting...Goodbye!","system");			
			process.exit(1);
		}
	}
	
	this.readStatusJson=function(config){
		this.log("Attempting to read controller/device state from ./status.json","init");
		try {
			config=JSON.parse(fs.readFileSync("status.json"));
			log("Read status.json successfully","init");
			return config;
		} catch (err) {
			log("Failed to read status.json ("+err+"), falling back to ./config.json","fs",true);
			return this.readConfigJson(config);
		}
	}

	this.writeJson=function(json,filename,callback){
		this.log("Attempting to store file with JSON data "+filename,"fs");
		fs.writeFile(filename,JSON.stringify(json),'utf8',function(err){
			if (err){
				return log("Failed to store "+filename,"fs",true)
			}
			log("Successfully stored "+filename,"fs");
			if (callback)callback(err);
		})
	}
	
	this.writeConfigJson=function(json,callback){
		this.writeJson(json,"./config.json",callback);
	}
	
	this.writeStatusJson=function(json,callback){
		this.writeJson(json,"./status.json",callback);
	}

	//Create and save new Id for a controller
	this.getNewControllerId=function(config){
		if (!config.registeredControllers) {
			config.registeredControllers=0;
		}
		config.registeredControllers++;
		this.writeConfigJson(config);
		return "C-"+(config.registeredControllers);		
	}

	this.log=function(t,q,err,forceWriteToErrorLog){
		var message;
		var e="";
		if (err){
			e="ERROR/";
		}
		if (q){
			message=e+q+": "+t;
		} else {
			message=e+"-: "+t;
		}
		console.log(dateTime(),message);
		//Write to error log if it's either an error or flag is set
		if (err || forceWriteToErrorLog){
			//Store error to error.log
			errorLogStream.write("\n"+dateTime()+" "+message);
		}
	}
	
	this.dateTime=function(){

		function twoDigits(x){
			if (x<10) x="0"+x;
			return x;
		}

		var d=new Date();
		var year=d.getFullYear();
		var month=twoDigits(d.getMonth());
		var day=twoDigits(d.getDate());
		var h=twoDigits(d.getHours());
		var m=twoDigits(d.getMinutes());
		var s=twoDigits(d.getSeconds());
	
		return year+"-"+month+"-"+day+" "+h+":"+m+":"+s;
	}

	this.myIP=function(){
		var os = require('os');
		var ifaces = os.networkInterfaces();
		var addresses=[];

		Object.keys(ifaces).forEach(function (ifname) {
		  ifaces[ifname].forEach(function (iface) {
		    if ('IPv4' !== iface.family || iface.internal !== false) {
		      // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
		      return;
		    }
		    addresses.push(iface.address);		    
		  });
		});

		//Return first valid IPv4 address
		return addresses[0];
	}	
	
	//Is k a substring of l, seen from the left?
	this.isChildTopicOf=function(k,l){
		return (l.substr(0,k.length)==k);
	}
	
	//Create a deep copy from src to dst without abandoning properties preexistant in dst but missing from src
	//Return whether or not the copy updated or created any values or created values
	this.deepCopy=function(src,dst,change){
		if (!change===true){
			change=false;
		}
		var change=false;
		for (var p in src){
		    if (src.hasOwnProperty(p)){
	    		if (src[p] instanceof Object){
	    			//Descend 
	    			if (!dst[p]){
	    				//Object didn't exist in dst yet
	    				dst[p]={};
	    				this.deepCopy(src[p],dst[p],true);
	    				change=true;
	    			} else {
	    				//Object exists in dst
	    				if (this.deepCopy(src[p],dst[p])){
	    					change=true;
	    				}
	    			}
	    		} else {
	    			//Plain value -> assign
	    			if (dst[p]!=src[p]){
	    				change=true;
	    			}
	    			dst[p]=src[p];
	    		}
		    }
		}
		return change;
	}
	
	//Make string JSON safe by deleting unsafe characters
	this.jsonSafe=function(str,makeVarNameCompliant){
		var regex;
		makeVarNameCompliant ? regex=/[^a-zA-Z\d]/g : regex=/"/g; //first regex: all non-alphanumeric characters 
		str=str.replace(regex,"");
		return str;
	}



}
