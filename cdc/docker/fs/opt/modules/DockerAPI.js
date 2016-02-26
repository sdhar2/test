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
var Persistence = require('../modules/Persistence');
var GlobalsConsts = require('../modules/GlobalsConsts');
var execSync = require('exec-sync');
var http = require('http');

/**
 * Global variables
 */
var docker = new Docker({protocol: 'http', host: 'dockerrepo', port: 4243});
var manifestDataRef;
var appStatusMapRef;
var releaseFileUnzipPathRef;
var installInProgressRef;

var persistence;

/**
 * Module class definition
 */
module.exports = function(manifestData, appStatusMap, installInProgress)
{
  appLogger.info("DockerAPI.enter");
  
  manifestDataRef = manifestData;
  appStatusMapRef = appStatusMap; 
  installInProgressRef = installInProgress;
  var completeIndex = 0;

  var appId = manifestDataRef.manifest.app.id;
  var appVersion = manifestDataRef.manifest.app.version;
  var containers = manifestDataRef.manifest.app.containers;

  /**
   * Docker load - load image from file or from remote registry 
   */
  this.load = function(releaseFileUnzipPath)
  {
    appLogger.info("DockerAPI.load.enter");

    releaseFileUnzipPathRef = releaseFileUnzipPath;

    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_LOAD_IMAGE,
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

    appLogger.info("DockerAPI.load, setting appStatus=" +
                   JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
    persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence.setAppinstallstatusDB(function (message) {
      appLogger.info('setAppinstallstatusDB operation = ' + message);
    });

    for (var index in containers) 
    {
      var image = containers[index];
      appLogger.info("DockerAPI.load, from manifest.json info - Image No.: " + index + 
                     ", imageName: " + image.imageName + ", version: " + image.version + 
                     ", imageFile: " + image.imageSource.imageFile);

      if (typeof image.imageSource.imageFile !== 'undefined')
      { 
        this.loadFromFile(image, releaseFileUnzipPathRef);
      }
      else if (typeof image.imageSource.remoteRegistry.location !== 'undefined')
      {
        this.loadFromRegistry(image);   		
      }
    }

    if (completeIndex == containers.length)
    {
      installInProgressRef.inProgress = false;
    }
      
    appLogger.info("DockerAPI.load.exit");
  };

  /**
   * Docker loadFromFile 
   */
  this.loadFromFile = function(image, releaseFileUnzipPath) 
  {
    appLogger.info("DockerAPI.loadFromFile.enter, image.imageName=%s, image.imageVersion=%s, image.imageSource.imageFile=%s", 
                   image.imageName, image.version, image.imageSource.imageFile);

    var imageTarFile = releaseFileUnzipPath  + image.imageSource.imageFile;  
    appLogger.info("DockerAPI.loadFromFile, imageTarFile = "+ imageTarFile);
	  
    var to = "dockerrepo:5000/" + image.imageName;
    var version = image.version;
    var imageName = image.imageName; 
  
    var command = "tar xf " + imageTarFile + " repositories -O";

    try
    {
      var content = execSync(command);
      appLogger.info("DockerAPI.loadFromFile, image file meta data content=" + content);

    }
    catch (err)
    {
      appLogger.error("DockerAPI.loadFromFile, error reading image tar file=" + imageTarFile +
                     ", unable to retrieve image tag");

      appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_IMAGE_FILE_FORMAT_ERROR,
      appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

      appLogger.info("DockerAPI.load, setting appStatus=" +
                     JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
      persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
      persistence.setAppinstallstatusDB(function (message) {
        appLogger.info('setAppinstallstatusDB operation = ' + message);
      });

      completeIndex ++;
      return;
    }

    var splitResult = content.split(":");
    var imageToGet = "";
		  
    if (splitResult[0]) 
    {
      imageToGet += splitResult[0].substr(2, splitResult[0].length - 3);
    }
		  
    if (splitResult[1]) 
    {
      imageToGet += ":" + splitResult[1].substr(2, splitResult[1].length - 3);
    }
		  
    appLogger.info("DockerAPI.loadFromFile, the image info from tar file=" + imageToGet); 	
    docker.loadImage(imageTarFile, {}, 
      function onCompleted(err, output) 
      {
        if (err)
        {
          appLogger.error("DockerAPI.loadFromFile, error loading image tar file=" + imageTarFile + ", err=" + err);

          appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_IMAGE_LOAD_ERROR,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

          appLogger.info("DockerAPI.load, setting appStatus=" +
                         JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
          persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppinstallstatusDB(function (message) {
            appLogger.info('setAppinstallstatusDB operation = ' + message);
          });
 
          completeIndex ++;
          if (completeIndex == containers.length)
          {
            installInProgressRef.inProgress = false;
          }
        }
        else
        {
          appLogger.info("DockerAPI.loadFromFile, completed loading docker image=" + imageTarFile);
          var image = docker.getImage(imageToGet);
          image.tag({repo : to, tag : version, force : true},
            function onCompleted(err, data) 
            {
              if (err)
              {
                appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_IMAGE_TAG_ERROR,
                appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

                appLogger.info("DockerAPI.loadFromFile, error tagging image to: " + to + ":" + version + ", err=" + err);

                appLogger.info("DockerAPI.load, setting appStatus=" +
                               JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
                persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                persistence.setAppinstallstatusDB(function (message) {
                  appLogger.info('setAppinstallstatusDB operation = ' + message);
                });

                completeIndex ++;
                if (completeIndex == containers.length)
                {
                  installInProgressRef.inProgress = false;
                }
              }
              else
              {
                appLogger.info("DockerAPI.loadFromFile, completed tagging docker image to: " + to + ":" + version);
                var image = docker.getImage(to);

                image.push({tag : version}, 
                  function onCompleted(err, data)  
                  {
                    if (err)
                    {
                      appLogger.error("DockerAPI.loadFromFile, error pushing image=" + to + ":" + version + ", err=" + err);

                      appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_IMAGE_PUSH_ERROR,
                      appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

                      appLogger.info("DockerAPI.load, setting appStatus=" +
                                     JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
                      persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                      persistence.setAppinstallstatusDB(function (message) {
                         appLogger.info('setAppinstallstatusDB operation = ' + message);
                      });
 
                      completeIndex ++;
                      if (completeIndex == containers.length)
                      {
                        installInProgressRef.inProgress = false;
                      }
                    }
                    else
                    {
                      data.pipe(process.stdout);
		              appLogger.info("DockerAPI.loadFromFile, completed pushing docker image=" + to + ":" + version);

                      completeIndex ++; 
                      if (completeIndex == containers.length)
                      {
                        installInProgressRef.inProgress = false;


                        appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_COMPLETE_INSTALL,
                        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_OK,
                        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

                        appLogger.info("DockerAPI.load, setting appStatus=" +
                                       JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
                        persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                        persistence.setAppinstallstatusDB(function (message) {
                           appLogger.info('setAppinstallstatusDB operation = ' + message);
                        });
                      }
                    }
                  }
                )
              }
            } 
          ) 
        } 
      }
    );
	 	
    appLogger.info("DockerAPI.loadFromFile.exit");
  }

  /**
   * Docker loadFromRegistry 
   */
  this.loadFromRegistry = function(image) 
  {
    appLogger.info("DockerAPI.loadFromRegistry.enter");
    appLogger.info("imageName:" + image.imageName + ", version: " + image.version);
    appLogger.info("image.imageSource.remoteRegistry.location: " + image.imageSource.remoteRegistry.location);

    var from = image.imageSource.remoteRegistry.location + "/" + image.imageName + ":" + image.version;   
    appLogger.info("DockerAPI.loadFromRegistry, load from repo: " + from);
    
    var to = "dockerrepo:5000/" + image.imageName;	
    appLogger.info("DockerAPI.loadFromRegistry, load to repo: " + to);
	
    var version = image.version;

    docker.pull(from, function onCompleted(err, output)
      {
        if (err)
        {
          appLogger.info("DockerAPI.loadFromRegistry, error pulling image=" + from + ", err=" + err);

          appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_IMAGE_PULL_ERROR,
          appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

          appLogger.info("DockerAPI.load, setting appStatus=" +
                         JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
          persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
          persistence.setAppinstallstatusDB(function (message) {
            appLogger.info('setAppinstallstatusDB operation = ' + message);
          });

          completeIndex ++;
          if (completeIndex == containers.length)
          {
            installInProgressRef.inProgress = false;
          }
        }
        else
        {
          appLogger.info("DockerAPI.loadFromRegistry, completed pulling docker image=" + from);
       	
          var image = docker.getImage(from);
          image.tag({repo : to, tag : version, force : true}, 
            function onCompleted(err, data) 
            {
              if (err)
              {
                appLogger.info("DockerAPI.loadFromRegistry, error tagging image to: " + to + ":" + version + ", err=" + err);

                appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_IMAGE_TAG_ERROR,
                appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

                appLogger.info("DockerAPI.load, setting appStatus=" +
                               JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
                persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                persistence.setAppinstallstatusDB(function (message) {
                  appLogger.info('setAppinstallstatusDB operation = ' + message);
                });

                completeIndex ++;
                if (completeIndex == containers.length)
                {
                  installInProgressRef.inProgress = false;
                }
              }
              else
              {
            	appLogger.info("DockerAPI.loadFromRegistry, completed tagging docker image to: " + to + ":" + version);
            	var image = docker.getImage(to);
            	image.push({tag : version},
                  function onCompleted(err, data)  
                  {
                    if (err)
                    {
                      appLogger.info("DockerAPI.loadFromRegistry, error pushing image=" + to + ":" + version + ", err=" + err);

                      appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_IMAGE_PUSH_ERROR,
                      appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

                      appLogger.info("DockerAPI.load, setting appStatus=" +
                                     JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
                      persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                      persistence.setAppinstallstatusDB(function (message) {
                        appLogger.info('setAppinstallstatusDB operation = ' + message);
                      });

                      completeIndex ++;
                      if (completeIndex == containers.length)
                      {
                        installInProgressRef.inProgress = false;
                      }
                    }
                    else
                    {
                      data.pipe(process.stdout);
                      appLogger.info("DockerAPI.loadFromRegistry, completed pushing docker image=" + to + ":" + version);

                      completeIndex ++;
                      if (completeIndex == containers.length)
                      {
                        installInProgressRef.inProgress = false;

                        appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_COMPLETE_INSTALL,
                        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_OK,
                        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

                        appLogger.info("DockerAPI.load, setting appStatus=" +
                                       JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
                        persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                        persistence.setAppinstallstatusDB(function (message) {
                           appLogger.info('setAppinstallstatusDB operation = ' + message);
                        });
                      }
                    }
                  })
              }
            }) 
        } 
      });

    appLogger.info("DockerAPI.loadFromRegistry.exit");
  }
  
  
  /**
   * Docker load - load image from file or from remote registry 
   */
  this.removeImages = function()
  {
    appLogger.info("DockerAPI.remove.enter");

    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_UNLOAD_IMAGE,
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

    appLogger.info("DockerAPI.remove, setting appStatus=" +
                   JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));

/* Persist app status */
    persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence.setAppinstallstatusDB(function (message) {
      appLogger.info('setAppinstallstatusDB operation = ' + message);
    });

    for (var index in containers) 
    {
      var image = containers[index];
      appLogger.info("DockerAPI.remove, from manifest.json info - Image No.: " + index + 
                     ", imageName: " + image.imageName + ", version: " + image.version + 
                     ", imageFile: " + image.imageSource.imageFile);

      var imageToDelete = "dockerrepo:5000/" + image.imageName + ":" + image.version;   
      appLogger.info("DockerAPI.remove, delete image form repo : " + imageToDelete);
      
      this.removeImage(imageToDelete);
      
    }
      
    appLogger.info("DockerAPI.remove.exit");
  };
  
  this.removeImage = function(imageToDelete)
  {
     appLogger.info("DockerAPI.removeImage imageName = " + imageToDelete);

     var image = docker.getImage(imageToDelete);
          image.remove({force : true}, function onCompleted(err, data)
          {
              if (err)
              {
                appLogger.info("DockerAPI.removeImage, error removing image:  " + imageToDelete + ", err=" + err);

                appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_IMAGE_REMOVE_ERROR,
                appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

                appLogger.info("DockerAPI.removeImage, setting appStatus=" +
                               JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));

                persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                persistence.setAppinstallstatusDB(function (message) {
                  appLogger.info('setAppinstallstatusDB operation = ' + message);
                });
              }
              else
              {
                  appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_UNLOAD_IMAGE,
                  appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();

                  appLogger.info("DockerAPI.removeImage, setting appStatus=" +
                                 JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));

              /* Persist app status */
                  persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
                  persistence.setAppinstallstatusDB(function (message) {
                    appLogger.info('setAppinstallstatusDB operation = ' + message);
                  });
              }
         });
  }
}
