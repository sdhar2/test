/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module provides various Docker APIs 
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var Docker = require('dockerode');
var fs = require('fs');
var GlobalsConsts = require('../modules/GlobalsConsts');
var execSync = require('exec-sync');
var Etcd = require('node-etcd');
var http = require('http');
var sleep = require('sleep');

/**
 * Global variables
 */
var docker = new Docker({protocol: 'http', host: 'swarmcluster', port: 2377});
var etcd = new Etcd('etcdcluster', '4001');
var manifestDataRef;
var imageDeployedMap;
var imagesForApp;
/**
 * Module class definition
 */
module.exports = function(manifestData)
{
  appLogger.info("SwarmAPI.enter");
  manifestDataRef = manifestData;

  imagesForApp= [];
  var containers = manifestDataRef.manifest.app.containers;
  for (var i in containers)
  {
     var image = containers[i];
     imagesForApp.push("dockerrepo:5000/" + image.imageName + ":" + image.version);
     appLogger.info("imagesForApp = " + imagesForApp);
  }

  /**
   * get all host IP addresses in swarm cluster
   */
  this.getSwarmNodeIPs = function(callback)
  {
    appLogger.info("SwarmAPI.getSwarmNodeIPs.enter");
    var hostIPs =[];

    etcd.get("/swarm/docker/swarm/nodes", { recursive: true }, function (err, response)
    {
      if (err)
      {
        // "/swarm/docker/swarm/nodes/" may not be created yet.
        if (err.errorCode == 100)
        {
          return callback(null, false);
        }
        return callback("ETCD get key error. " + err.message, false);
      }

      var content = "[swarm]\r\n";

      var nodes = response.node.nodes;
      for (var index in nodes)
      {
        var ipAndPort = nodes[index].value.split(":");
        var ip = ipAndPort[0];
        content += ip + "\r\n";
      }
      appLogger.info("SwarmAPI.getSwarmInfo, content is:\r\n" + content);

      try
      {
        fs.writeFileSync("/opt/code_controller/deploy/resources", content);
      }
      catch (err)
      {
        appLogger.error("SwarmAPI writing all ip address to file, err=" + err);
        return callback(null, false);
      }
      return callback(null, true);
    });
  }

  this.getDeployedImageMap = function(imagesForApp, callback)
  {
    var options =
    {
       host: 'swarmcluster',
       path: '/containers/json',
       port: '2377',
       method: 'GET'
    };

    appLogger.info("SwarmAPI.getDeployedImageMap for images: ", imagesForApp);

    var request = http.request(options, function(response)
    {
      var swarm_json_response_str = '';

      //continue to retrieve date until done
      response.on('data', function(chunk)
      {
        swarm_json_response_str += chunk;
      });

      //the whole response has been received, process the result
      response.on('end', function ()
      {
        //appLogger.info("SwarmAPI.getDeployedImageMap Received SWARM API containers info response: %s", swarm_json_response_str);

		//convert the response to JSON object
        try
        {
          var containerInfos = JSON.parse(swarm_json_response_str);
          imageDeployedMap ={};
          for (var i in containerInfos)
          {
            var containerInfo = containerInfos[i];
            var containerImage = containerInfo.Image;
            if (imagesForApp.indexOf(containerImage) > -1)
            {
               var containerInfoArray = imageDeployedMap[containerImage];
               if (!containerInfoArray)
               {
                 containerInfoArray = [];
               }
               if(containerInfoArray.indexOf(containerInfo) < 0)
               {
                 containerInfoArray.push(containerInfo);
               }
               imageDeployedMap[containerImage] = containerInfoArray;
            }
          }

		  for (var i in imageDeployedMap)
          {
            appLogger.info("** Key: " + i + ", *** imageDeployedMap Value: " + imageDeployedMap[i]);
          }
          return callback(null, imageDeployedMap);
        }
        catch (err)
        {
          // If it will not parse, then swarm_json_response_str is an error message
          appLogger.error("SwarmAPI.getDeployedImageMap Error process response from swarm cluster: " + err.message);
          return callback("Error process response from swarm cluster. " + swarm_json_response_str, imageDeployedMap);
        }
      });
    });

    //request error handling
    request.on('error', function(err)
    {
      appLogger.info("SwarmAPI.getDeployedImageMap Error retrieving containers info from swarmcluster. " + err.message);
      return callback("Error reteieving containers info from swarmcluster. " + err.message, imageDeployedMap);
    });

    request.end();
  }

  /* this is API for get the current scale level for scale up and down */
  this.getImageDeployedCount = function(callback)
  {
      var options =
      {
        	host: 'swarmcluster',
        	path: '/containers/json',
        	port: '2377',
        	method: 'GET'
      };

      var imageDeployedCount = {};
      appLogger.info("SwarmAPI.getImageDeployedCount enter");

      var request = http.request(options, function(response)
      {
            var swarm_json_response_str = '';

        	//continue to retrieve date until done
        	response.on('data', function(chunk)
        	{
        		swarm_json_response_str += chunk;
        	});

        	//the whole response has been received, process the result
        	response.on('end', function ()
        	{
        		//appLogger.info("SwarmAPI.getImageDeployedCount Received SWARM API containers info response: %s", swarm_json_response_str);

        		//convert the response to JSON object
        		try
        		{
        			var containerInfos = JSON.parse(swarm_json_response_str);
                	for (var i in containerInfos)
                	{
                		var containerImage = containerInfos[i].Image;

                		 var imageCount = imageDeployedCount[containerImage];
                         if (!imageCount)
                         {
                             imageCount = 0;
                         }
                         imageCount += 1;
                         imageDeployedCount[containerImage] = imageCount;
                	}

                	for (var i in imageDeployedCount)
                    {
                      appLogger.info("** Key: " + i + ", *** Value: " + imageDeployedCount[i]);
                    }

                    return callback(null, imageDeployedCount);

        		}
        		catch (err)
        		{
        			// If it will not parse, then swarm_json_response_str is an error message
        			appLogger.error("SwarmAPI.getImageDeployedCount Error process response from swarm cluster: " + err.message);
        			return callback("Error process response from swarm cluster. " + swarm_json_response_str, imageDeployedCount);
        		}
        	});
      });

        //request error handling
      request.on('error', function(err)
      {
          appLogger.error("SwarmAPI.getImageDeployedCount Error reteieving containers info from swarmcluster. " + err.message);
          return callback("Error reteieving containers info from swarmcluster. " + err.message, imageDeployedCount);
       });

       request.end();
  }

  /* This is for details status for deploy, need to pass the initial scale data,
     should retrive the imageDeployMap every time in the future? */

  this.getImageListFromSwarm = function(scaleId, callback)
  {
 	  var imageList = [];
 	  var scaleDataMap ={};
 	  var containers = manifestDataRef.manifest.app.containers;
 	  for (var i in containers)
      {
        var scale = containers[i].scale;
        var imageName = "dockerrepo:5000/" + containers[i].imageName + ":" + containers[i].version;
        if (scale && scale.length > 0)
        {
          for (var j = 0; j < scale.length; j ++)
          {
            if (scale[j].level == scaleId)
            {
               scaleDataMap[imageName] = scale[j].instances;
               appLogger.info("key = " + imageName + " +++ scale = " + scale[j].instances);
            }
          }
        }
      }


 	  this.getDeployedImageMap(imagesForApp, function (err, imageDeployedMap)
 	  {
 	    for (var key in imageDeployedMap)
 	    {
 		  var imageInfo = {};
 		  imageInfo.imageName = key;
 		  imageInfo.initialScale = scaleDataMap[key];
 		  imageInfo.currentScale = imageDeployedMap[key].length;
 		  imageInfo.containers = imageDeployedMap[key];
 		  imageList.push(imageInfo);
 	    }
// 	    appLogger.info("SwarmAPI.getImageListFromSwarm imageList = " + JSON.stringify(imageList));
 	    return callback(null,imageList);
 	   });
  }


   this.getPortMap = function(imagesForApp, imageDeployedMap)
    {
      var portsMap = {};
      for (var j in imagesForApp)
      {
        var imageName = imagesForApp[j];
        var containerInfos = imageDeployedMap[imageName];
        for (var i in containerInfos)
        {
         var privatePort = containerInfos[i].Ports[0].PrivatePort;
         var publicPort = containerInfos[i].Ports[0].PublicPort;
         var ip = containerInfos[i].Ports[0].IP;
         if (privatePort != undefined && publicPort != undefined)
         {
            var publicPortsArray = portsMap[ip + ":" + privatePort];
            if (!publicPortsArray)
            {
               publicPortsArray = [];
            }
            if(publicPortsArray.indexOf(publicPort) < 0)
                publicPortsArray.push(publicPort);
            portsMap[ip + ":" + privatePort] = publicPortsArray;
         }
        }
      }
      return portsMap;
    }
}
