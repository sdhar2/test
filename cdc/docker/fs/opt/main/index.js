/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * Main Code Controller REST API Handlers
 */

/**
 * Import modules
 */
var express = require('express');
var router = express.Router();
var fs = require('fs');
var appLogger = require('../utils/app_logger');
var AppInstaller = require('./AppInstaller');
var AppDeployer = require('./AppDeployer');
var AppScaler = require('./AppScaler');
var AppUnInstaller = require('./AppUnInstaller');
var AppUnDeployer = require('./AppUnDeployer');
var appInstallError = new require('../modules/AppInstallError');
var Persistence = require('../modules/Persistence');
var MapLoaderFromDB = require('../modules/MapLoaderFromDB');
var GlobalsConsts = require('../modules/GlobalsConsts');
var SwarmAPI = require('../modules/SwarmAPI');
/**
 * Global variables
 */
var manifestDataMap = {};      /* key=appId:version; value=parsed manifest json object */
var installAppStatusMap = {};  /* key=appId:version; value={type, stateCode, resultCode, started, lastChange} */
var deployAppStatusMap = {};  /* key=appId:version; value={type, stateCode, resultCode, started, lastChange} */
var installAppPorts = {} /* key=appId:version; value={portLists} */
var installInProgress = {inProgress: false};
var uninstallInProgress = {inProgress: false};
var mapLoaderFromDB = new MapLoaderFromDB(installAppStatusMap,deployAppStatusMap,installAppPorts);
mapLoaderFromDB.load(function (message,installAppStatusMapDB,deployAppStatusMapDB,installAppPortsDB) {
   appLogger.info('Load maps from DB operation = ' + message);
   if ( message === 'ERROR') {
     throw exports.RESULT_DBAAS_CONNECTION_ERROR;
   }
   installAppStatusMap = installAppStatusMapDB;
   deployAppStatusMap = deployAppStatusMapDB;
   installAppPorts = installAppPortsDB;
});
var persistence;
var scaleMap ={};

var password = process.argv[3];

/**
 * Constants
 */
const RELEASE_FILEPATH = "/opt/code_controller/releases";

/**
 * GET home page. 
 */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

/** 
 * Handler for install application 
 */
router.post('/cdcaas/v1.0/install',
  function(req, res, next)
  {
    appLogger.info("CodeController received install application request");

    if (installInProgress.inProgress)
    {
      appLogger.info("Application install in progress, no concurrent install is allowed");
      res.status(503).send("Application install in progress, no concurrent install is allowed");  
      return;
    }
    
    installInProgress.inProgress = true;
   
    var releaseFile = req.query.file;

    if (releaseFile)
    {
      appLogger.info("ReleaseFile=" + releaseFile);
      var appInstaller = new AppInstaller(releaseFile, manifestDataMap, installAppStatusMap, deployAppStatusMap, installInProgress);

      try 
      { 
        var contentBody = appInstaller.preProcessReleaseFile();
        res.set('Content-Type', 'application/json');
        res.status(201).send(JSON.stringify(contentBody));
        appInstaller.go(); 
      }
      catch (err)
      {
        appLogger.info("AppInstaller encountered error, err=" + JSON.stringify(err));
        if (err.code == GlobalsConsts.RESULT_FILE_NOT_FOUND.code)
        {
          res.status(404).send("Unable to find the specified release file: " + releaseFile);
        }
        else if (err.code == GlobalsConsts.RESULT_MANIFEST_PARSE_ERROR.code)
        {
          res.status(400).send("Error parsing manifest file");
        }
        else if (err.code == GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR.code)
        {
          res.status(400).send("Configuration error in manifest file");
        }
        else
        {
          appLogger.info("Unhandled exception occured");
          res.status(400).send("Unhandled exception occured");
        }

        installInProgress.inProgress = false;
      }
    }
    else
    {
      appLogger.error("No releaseFile is specified in install application request");
      res.status(400).send("No releaseFile is specified in install application request");
      installInProgress.inProgress = false;
    }
  }
);

/**
 * Handler for deploy application
 */
router.put('/cdcaas/v1.0/deploy/:appId/:appVersion',
  function(req, res, next)
  {
    appLogger.info("CodeController received deploy application request");

    var appId = req.params.appId;
    var appVersion = req.params.appVersion;
    var resourceId = req.query.resources; 
    var scaleId = req.query.scale;

    if (appId && appVersion)
    {
      if (!resourceId || !scaleId)
      {
        appLogger.info("No resources-id or scale-id is specified in application deployment request");
        res.status(400).send("No resources-id or scale-id is specified in application deployment request");
        return;
      }

      var installStatus = installAppStatusMap[appId + ":" + appVersion];
      var deployStatus = deployAppStatusMap[appId + ":" + appVersion];
      scaleMap[appId + ":" + appVersion] = scaleId;
      
      if (!installStatus)
      {
        res.status(404).send("Requested deployment of application for app-id or app-version is not presently installed");
        appLogger.error("Requested deployment of application for appId=" + appId + " and appVersion=" 
                       + appVersion + " is not presently installed");
        return;
      }

      if (installStatus.stateCode.code == GlobalsConsts.APP_STATE_COMPLETE_UNINSTALL.code) 
      { 
		  res.status(404).send("Application with app-id is already unInstall. please install it again.");
	      appLogger.error("Application with app-id=" + appId + ":" + appVersion + " already unInstall. please install it again");	         
	      return;     
      }
      
	  for (var key in deployAppStatusMap)
      {
        var deployedAppId = key.split(':')[0];
        var deployedVersion = key.split(':')[1];
        if ((deployedAppId === appId) &&
            (deployedVersion !== appVersion))
        {

          if ((deployAppStatusMap[key].stateCode.code == GlobalsConsts.APP_STATE_COMPLETE_DEPLOY) &&  
              (deployAppStatusMap[key].resultCode.code == GlobalsConsts.RESULT_OK))
          {
            res.status(409).send("A different version of application app-id is already deployed.");
            appLogger.info("A different version of application app-id=" + appId + " is already deployed.");
            return;
          }
        }
      }
	       
    
      appLogger.info("Request deploy for application appId=" + appId + ", appVersion=" + appVersion + ", resourceId=" + resourceId + ", scaleId=" + scaleId);

      appLogger.info("installStatus=" + JSON.stringify(installStatus));

      if (deployStatus)
      {
        appLogger.info("deployStatus=" + JSON.stringify(deployStatus));
      }

      if ((installStatus.stateCode.code != GlobalsConsts.APP_STATE_COMPLETE_INSTALL.code) &&
          (installStatus.resultCode.code != GlobalsConsts.RESULT_OK.code))
      {
        res.status(503).send("Application installation is in progress or installation does not complete successfully, unable to deploy");
        appLogger.error("Application installation for appId=" + appId +
                       " and appVersion=" + appVersion + " is in progress or installation does not complete successfully, unable to deploy");
        return;
      }

      if (deployStatus && (deployStatus.resultCode.code == GlobalsConsts.RESULT_PENDING.code)) 
      {
        res.status(503).send("Application deployment is in progress, unable to deploy");
        appLogger.error("Application deployment for appId=" + appId +
                       " and appVersion=" + appVersion + " is in progress, unable to deploy");
        return;
      }
     
      try
      {
        var manifestData = manifestDataMap[appId + ":" + appVersion];
        if (!manifestData) {
          persistence = new Persistence(appId,appVersion);
          persistence.checkAppIdDB(function (message) {
            currentappstatus=message;
            if (currentappstatus == '1') {
              persistence.getManifestdataFromDB(function (manifestdataDB) {
                if (manifestdataDB != 'NULL') {
                  appLogger.info(' Load manifestdataDB = SUCCESS');
                  manifestData = manifestdataDB;
                  manifestDataMap[appId + ":" + appVersion] = manifestData;
                }
              });
            }
          });
        }
        var appDeployer = new AppDeployer(deployAppStatusMap, manifestData, password, resourceId, scaleId, installAppPorts);
        if (!appDeployer.validateResourceAndScaleIds())
        {
          res.status(400).send("Scale-id or resources-id cannot be matched to a scale or resources declaration in the applications manifest file");
          appLogger.error("Scale-id=" + scaleId + " or resources-id=" + resourceId + " cannot be matched to a scale or resources declaration in the application's manifest file");
          return;
        }
        else 
        {
          res.status(201).send("Application deployment is underway");
          appDeployer.preProcess();
          appDeployer.go();
        }
      }
      catch (err)
      {
        appLogger.error("AppDeployer encountered error, err=" + JSON.stringify(err));

        deployAppStatusMap[appId + ":" + appVersion].resultCode = err,
        deployAppStatusMap[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.info("AppDeployer setting appStatus=" +
                        JSON.stringify(deployAppStatusMap[appId + ":" + appVersion]));
        var deployStatusPersist = deployAppStatusMap[appId + ":" + appVersion]; 
        persistence = new Persistence(appId, appVersion,JSON.stringify({}),JSON.stringify(deployStatusPersist));
        persistence.setAppdeploystatusDB(function (message) {
           appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      }  
    } 
    else
    {
      appLogger.error("No application app-id or app-version is specified in application deployment request");
      res.status(400).send("No application app-id or app-version is specified in application deployment request");
    }
  }
);

/** 
 * Handler for retrieving release file list 
 */
router.get('/cdcaas/v1.0/release',
  function(req, res, next)
  {
    appLogger.info("CodeController received retrieving release file list request");

    try
    {
      var allFiles = fs.readdirSync(RELEASE_FILEPATH);
      var releaseFiles = [];

      //filter in only zip files
      for (var i = 0; i < allFiles.length; i ++)
      {
        if (allFiles[i].length < 5)
        {
          continue;
        }

        if (allFiles[i].substring((allFiles[i].length - 4), allFiles[i].length) === ".zip")
        { 
          releaseFiles.push(allFiles[i]);
        }
      }

      var respContentBody = {$schema: "/schemas/ReleaseFileList/v1.0",
                             ReleaseFileList: releaseFiles};

      res.set('Content-Type', 'application/json');
      res.status(200).send(JSON.stringify(respContentBody));
    }
    catch (err)
    {
      appLogger.error("Encountered error while retrieving release file list, err=" + JSON.stringify(err));
      res.status(500).send("Encountered error while retrieving release file list");
    }
  }
);

/**
 * Handler for retrieve installation status 
 */
router.get('/cdcaas/v1.0/install/:appId/:appVersion',
  function(req, res, next)
  {
    appLogger.info("CodeController received retrieve installation status request");

    var appId = req.params.appId;
    var appVersion = req.params.appVersion;

    if (appId && appVersion)
    {
      var status = installAppStatusMap[appId + ":" + appVersion];
      if (status)
      {
        var respContentBody = {$schema: "/schemas/App/v1.0",
                               App: {Task: {type: status.type.text,
                                            started: status.started,
                                            status: status.stateCode.text,
                                            result: status.resultCode.text,
                                            lastChange: status.lastChange}}};

        res.set('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(respContentBody));
      }
      else
      {
        res.status(404).send("The application identified by app-id and app-version is neither installed nor is installation underway");
        appLogger.error("The application identified by app-id=" + appId + " and app-version=" + appVersion + " is neither installed nor is installation underway");
      }
    }
    else
    {
      appLogger.error("No application app-id or app-version is specified in the retrieve installation status request");
      res.status(400).send("No application app-id or app-version is specified in the retrieve installation status request");
    }
  }
);

/**
 * Handler for retrieve installed apps
 */
router.get('/cdcaas/v1.0/install',
  function(req, res, next)
  {
    appLogger.info("CodeController received retrieve installed apps request");

    var allAttempts = req.query.allAttempts;
    var uninstallations = req.query.uninstallations;
    var installedApps = [];

    if (allAttempts && allAttempts === "true")
    {
      for (var key in installAppStatusMap)
      {
    	  if ((installAppStatusMap[key].stateCode.code != GlobalsConsts.APP_STATE_COMPLETE_UNINSTALL.code)) 
		  {
    		  var installedApp = {id: key.split(':')[0],
    				  			version: key.split(':')[1],
    				  			Task: {type: installAppStatusMap[key].type.text,
    				  					started: installAppStatusMap[key].started,
    				  					status: installAppStatusMap[key].stateCode.text,
                                   		result: installAppStatusMap[key].resultCode.text,
                                   		lastChange: installAppStatusMap[key].lastChange}};
    		  installedApps.push(installedApp);
		  }
      }
    }
    else
    {
      for (var key in installAppStatusMap)
      {
        if ((installAppStatusMap[key].stateCode.code == GlobalsConsts.APP_STATE_COMPLETE_INSTALL.code) &&
           (installAppStatusMap[key].resultCode.code == GlobalsConsts.RESULT_OK.code))
        {
          var installedApp = {id: key.split(':')[0],
                              version: key.split(':')[1],
                              Task: {type: installAppStatusMap[key].type.text,
                                     started: installAppStatusMap[key].started,
                                     status: installAppStatusMap[key].stateCode.text,
                                     result: installAppStatusMap[key].resultCode.text,
                                     lastChange: installAppStatusMap[key].lastChange}};
          installedApps.push(installedApp);
        }
      }
    }
    
    if (uninstallations && uninstallations === "true")
    {
      for (var key in installAppStatusMap)
      {
		  if ((installAppStatusMap[key].stateCode.code == GlobalsConsts.APP_STATE_COMPLETE_UNINSTALL.code) &&
		      (installAppStatusMap[key].resultCode.code == GlobalsConsts.RESULT_OK.code))
	      {
	       var installedApp = {id: key.split(':')[0],
	                           version: key.split(':')[1],
	                           Task: {type: installAppStatusMap[key].type.text,
	                                  started: installAppStatusMap[key].started,
	                                  status: installAppStatusMap[key].stateCode.text,
	                                  result: installAppStatusMap[key].resultCode.text,
	                                  lastChange: installAppStatusMap[key].lastChange}};
	       installedApps.push(installedApp);
	     }
     }
    }
      
    var respContentBody = {$schema: "/schemas/AppList/v1.0",
                           AppList: installedApps};

    res.set('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(respContentBody));
  }
);

/**
 * Handler for retrieve deployment status 
 */
router.get('/cdcaas/v1.0/deploy/:appId/:appVersion',
  function(req, res, next)
  {
    appLogger.info("CodeController received retrieve deployment status request");

    var appId = req.params.appId;
    var appVersion = req.params.appVersion;
    var details = req.query.details;

    if (appId && appVersion)
    {
      var status = deployAppStatusMap[appId + ":" + appVersion];
      if (status)
      {

        if (details == "true")
        {
          manifestData = manifestDataMap[appId + ":" + appVersion];
          var scaleId = scaleMap[appId + ":" + appVersion];
          if (!manifestData) {
            persistence = new Persistence(appId,appVersion);
            persistence.checkAppIdDB(function (message) {
              currentappstatus=message;
              if (currentappstatus == '1') {
                persistence.getManifestdataFromDB(function (manifestdataDB) {
                  if (manifestdataDB != 'NULL') {
                    appLogger.info(' Load manifestdataDB = SUCCESS');
                    manifestData = manifestdataDB;
                    manifestDataMap[appId + ":" + appVersion] = manifestData;
                    var swarmAPI = new SwarmAPI(manifestData);
                    swarmAPI.getImageListFromSwarm(scaleId, function (err, imageList)
                    {
                       if (err)
                       {
                          appLogger.info("Failed to get image list from Swarm cluster.");
                       }
                       if (imageList)
                       {
                         appLogger.info("imageList = " + imageList);

                         var respContentBody = {$schema: "/schemas/App/v1.0",
                          App: {Task: {type: status.type.text,
                          started: status.started,
                          status: status.stateCode.text,
                          result: status.resultCode.text,
                          lastChange: status.lastChange}},
                          DeploymentDetails: {imageList: imageList}};

                         res.set('Content-Type', 'application/json');
                         res.status(200).send(JSON.stringify(respContentBody));
                       }
                    });
                  }
                });
              }
            });
          }
          else {
            var swarmAPI = new SwarmAPI(manifestData);
            swarmAPI.getImageListFromSwarm(scaleId, function (err, imageList)
            {
               if (err)
               {
                  appLogger.info("Failed to get image list from Swarm cluster.");
               }
               if (imageList)
               {
                 appLogger.info("imageList = " + imageList);

                 var respContentBody = {$schema: "/schemas/App/v1.0",
                  App: {Task: {type: status.type.text,
                  started: status.started,
                  status: status.stateCode.text,
                  result: status.resultCode.text,
                  lastChange: status.lastChange}},
                  DeploymentDetails: {imageList: imageList}};

                 res.set('Content-Type', 'application/json');
                 res.status(200).send(JSON.stringify(respContentBody));
               }
            });
          }
        }
        else
        {
           var respContentBody = {$schema: "/schemas/App/v1.0",
                                          App: {Task: {type: status.type.text,
                                                       started: status.started,
                                                       status: status.stateCode.text,
                                                       result: status.resultCode.text,
                                                       lastChange: status.lastChange}}};
           res.set('Content-Type', 'application/json');
           res.status(200).send(JSON.stringify(respContentBody));
        }
      }
      else
      {
        res.status(404).send("The application identified by app-id and app-version is neither deployed nor is deployment underway");
        appLogger.error("The application identified by app-id=" + appId + " and app-version=" + appVersion + " is neither deployed nor is deployment underway");
      }
    }
    else
    {
      appLogger.error("No application app-id or app-version is specified in the retrieve deployment status request");
      res.status(400).send("No application app-id or app-version is specified in the retrieve deployment status request");
    }
  }
);

/**
 * Handler for retrieve deployed apps
 */
router.get('/cdcaas/v1.0/deploy',
  function(req, res, next)
  {
    appLogger.info("CodeController received retrieve deployed apps request");

    var allAttempts = req.query.allAttempts;
    var undeployments = req.query.undeployments;
    var deployedApps = [];

    if (allAttempts && allAttempts === "true")
    {
      for (var key in deployAppStatusMap)
      {
		  if ((deployAppStatusMap[key].stateCode.code != GlobalsConsts.APP_STATE_COMPLETE_UNDEPLOY.code))
		  {
			  var deployedApp = {id: key.split(':')[0],
	                  version: key.split(':')[1],
	                      Task: {type: deployAppStatusMap[key].type.text,
	                             started: deployAppStatusMap[key].started,
	                             status: deployAppStatusMap[key].stateCode.text,
	                             result: deployAppStatusMap[key].resultCode.text,
	                             lastChange: deployAppStatusMap[key].lastChange}};
			  deployedApps.push(deployedApp);
		  }
       
      }
    }
    else
    {
      for (var key in deployAppStatusMap)
      {
        if ((deployAppStatusMap[key].stateCode.code == GlobalsConsts.APP_STATE_COMPLETE_DEPLOY.code) &&
           (deployAppStatusMap[key].resultCode.code == GlobalsConsts.RESULT_OK.code))
        {
          var deployedApp = {id: key.split(':')[0],
                             version: key.split(':')[1],
                             Task: {type: deployAppStatusMap[key].type.text,
                                    started: deployAppStatusMap[key].started,
                                    status: deployAppStatusMap[key].stateCode.text,
                                    result: deployAppStatusMap[key].resultCode.text,
                                    lastChange: deployAppStatusMap[key].lastChange}};
          deployedApps.push(deployedApp);
        }
      }
    }
    
    if (undeployments && undeployments === "true")
    {
      for (var key in deployAppStatusMap)
      {
    	if ((deployAppStatusMap[key].stateCode.code == GlobalsConsts.APP_STATE_COMPLETE_UNDEPLOY.code) &&
    	    (deployAppStatusMap[key].resultCode.code == GlobalsConsts.RESULT_OK.code))
    	{  
	        var deployedApp = {id: key.split(':')[0],
	                           version: key.split(':')[1],
	                           Task: {type: deployAppStatusMap[key].type.text,
	                                  started: deployAppStatusMap[key].started,
	                                  status: deployAppStatusMap[key].stateCode.text,
	                                  result: deployAppStatusMap[key].resultCode.text,
	                                  lastChange: deployAppStatusMap[key].lastChange}};
	        deployedApps.push(deployedApp);
      }
     }
    }

    var respContentBody = {$schema: "/schemas/AppList/v1.0", AppList: deployedApps};

    res.set('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(respContentBody));
  }
);

/**
 * Handler for app unDeploy
 */
router.delete('/cdcaas/v1.0/deploy/:appId/:appVersion',
  function(req, res, next)
  {
	appLogger.info("CodeController received undeploy application request");
	
    var appId = req.params.appId;
    var appVersion = req.params.appVersion;
        

    if (appId && appVersion)
    {      
      var deployStatus = deployAppStatusMap[appId + ":" + appVersion];      
      var installStatus = installAppStatusMap[appId + ":" + appVersion];

      if (!deployStatus)
      {
        res.status(405).send("Requested undeployment of application for app-id or app-version is not presently deployed");
        appLogger.error("Requested undeployment of application for appId=" + appId + " and appVersion=" 
                       + appVersion + " is not presently deployed");
        return;
      }  
      
      if ( (deployStatus.stateCode.code == GlobalsConsts.APP_STATE_COMPLETE_UNDEPLOY.code) &&  
           (deployStatus.resultCode.code == GlobalsConsts.RESULT_OK.code) )
      {
        res.status(404).send("Application with app-id is already undeployed.");
        appLogger.error("Application with app-id=" + appId + " is already undeployed.");
        return;
      }
    
      appLogger.info("Request Undeploy for application appId=" + appId + ", appVersion=" + appVersion);

    /*  if ((deployStatus.stateCode.code != GlobalsConsts.APP_STATE_COMPLETE_UNDEPLOY.code) &&
          (deployStatus.resultCode.code != GlobalsConsts.RESULT_OK.code))
      {
        res.status(503).send("Application undeployment is in progress or undeployment did not complete successfully, unable to undeploy");
        appLogger.error("Application unDeployment for appId=" + appId +
                       " and appVersion=" + appVersion + " is in progress or undeployment did not complete successfully, unable to undeploy");
        return;       
      }*/

     if (deployStatus && (deployStatus.resultCode.code == GlobalsConsts.RESULT_PENDING.code)) 
      {
        res.status(503).send("Application undeployment is in progress, unable to undeploy");
        appLogger.error("Application undeployment for appId=" + appId +
                       " and appVersion=" + appVersion + " is in progress, unable to undeploy");
        return;
      }

      res.status(200).send("Application undeployment is underway");

      try
      {
        var manifestData = manifestDataMap[appId + ":" + appVersion];
        if (!manifestData) {
          persistence = new Persistence(appId,appVersion);
          persistence.checkAppIdDB(function (message) {
            currentappstatus=message;
            if (currentappstatus == '1') {
              persistence.getManifestdataFromDB(function (manifestdataDB) {
                if (manifestdataDB != 'NULL') {
                  appLogger.info(' Load manifestdataDB = SUCCESS');
                  manifestData = manifestdataDB;
                  manifestDataMap[appId + ":" + appVersion] = manifestData;
                }
              });
            }
          });
        }
        var appUnDeployer = new AppUnDeployer(deployAppStatusMap, manifestData, password, installAppPorts);
        appUnDeployer.go();      
      }
      catch (err)
      {
        appLogger.info("AppUnDeployer encountered error, err=" + JSON.stringify(err));

        deployAppStatusMap[appId + ":" + appVersion].resultCode = err,
        deployAppStatusMap[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.error("AppUnDeployer setting appStatus=" +
                        JSON.stringify(unDeployAppStatusMap[appId + ":" + appVersion]));
        var deployStatusPersist = deployAppStatusMap[appId + ":" + appVersion];
        persistence = new Persistence(appId, appVersion,JSON.stringify({}),JSON.stringify(deployStatusPersist));
        persistence.setAppdeploystatusDB(function (message) {
           appLogger.info('setAppdeploystatusDB operation = ' + message);
        });
      }  
    } 
    else
    {
      appLogger.error("No application app-id or app-version is specified in application undeployment request");
      res.status(400).send("No application app-id or app-version is specified in application undeployment request");
    }  
    
  }
);

/**
 * Handler for app unInstall
 */
router.delete('/cdcaas/v1.0/install/:appId/:appVersion',
  function(req, res, next)
  {
    appLogger.info("CodeController received uninstall app request");
    
    var appId = req.params.appId;
    var appVersion = req.params.appVersion;
   
    var installStatus = installAppStatusMap[appId + ":" + appVersion];
    var deployStatus = deployAppStatusMap[appId + ":" + appVersion];

    if (appId && appVersion)
    { 

	    appLogger.info("Request UnInstall for application appId=" + appId + ", appVersion=" + appVersion + "InstallStatus " + JSON.stringify(installStatus));
		 
		if (!installStatus)
		{
		   res.status(404).send("Requested uninstall of application for app-id or app-version is not presently installed or deployed");
		   appLogger.error("Requested uninstall of application for appId=" + appId + " and appVersion=" + appVersion + " is not presently installed");
		  return;
		}  
		
		if( (installStatus.stateCode.code == GlobalsConsts.APP_STATE_COMPLETE_UNINSTALL.code) )
        { 
  		  res.status(404).send("Application with app-id is already unInstall.");
  	      appLogger.error("Application with app-id=" + appId + ":" + appVersion + " already unInstall.");	         
  	      return;     
        }
								
	    if (deployStatus)
	    {
	    	if( (deployStatus.stateCode.code != GlobalsConsts.APP_STATE_COMPLETE_UNDEPLOY.code) )
	          { 
	    		  res.status(409).send("The release cannot be uninstalled because it is presently deployed. " +
	    		  		"Use Undeploy-App on a deployed application before using Uninstall-Release.");
	    	      appLogger.error("Application with app-id=" + appId + ":" + appVersion + " must be undeployed before unInstall.");	         
	    	      return;     
	          }
	    }
	    
        if (uninstallInProgress.inProgress)
		{
		  appLogger.warn("Application uninstall in progress, no concurrent uninstall is allowed");
		  res.status(503).send("Application uninstall in progress, no concurrent uninstall is allowed");  
		  return;
		}   
        
	    uninstallInProgress.inProgress = true;
	
	    res.status(200).send("Application uninstall is underway");
	    
      try 
      { 
         var manifestData = manifestDataMap[appId + ":" + appVersion];
         if (!manifestData) {
           persistence = new Persistence(appId,appVersion);
           persistence.checkAppIdDB(function (message) {
             currentappstatus=message;
             if (currentappstatus == '1') {
               persistence.getManifestdataFromDB(function (manifestdataDB) {
                 if (manifestdataDB != 'NULL') {
                   appLogger.info(' Load manifestdataDB = SUCCESS');
                   manifestData = manifestdataDB;
                   manifestDataMap[appId + ":" + appVersion] = manifestData;
                 }
               });
             }
           });
         }
         var appUnInstaller = new AppUnInstaller(manifestData, installAppStatusMap, uninstallInProgress);
         appUnInstaller.go(); 
         uninstallInProgress.inProgress = false;
      }
      catch (err)
      {
        appLogger.error("AppUnInstaller encountered error, err=" + JSON.stringify(err));

        installAppStatusMap[appId + ":" + appVersion].resultCode = err,
        installAppStatusMap[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.info("AppUnInstaller setting appStatus=" +
                        JSON.stringify(installAppStatusMap[appId + ":" + appVersion]));

        uninstallInProgress.inProgress = false;
        var installAppStatusPersist = installAppStatusMap[appId + ":" + appVersion];

        persistence = new Persistence(appId, appVersion, JSON.stringify(installAppStatusPersist));
        persistence.setAppinstallstatusDB(function (message) {
           appLogger.info('setAppinstallstatusDB operation = ' + message);
        });
      }
    }     
    else
    {
      appLogger.error("No application app-id or app-version is specified in application unInstall request");
      res.status(400).send("No application app-id or app-version is specified in application unInstall request");
      uninstallInProgress.inProgress = false;
    }  
    
  }
);

/**
 * Handler for deploy application with 
 */
router.put('/cdcaas/v1.0/deploy/:appId/:appVersion/images/:imageName/scale',
  function(req, res, next)
  {
	appLogger.info("CodeController received scale app request");
    
    var appId = req.params.appId;
    var appVersion = req.params.appVersion;
    var imageName = req.params.imageName;

    var up = req.query.up;
    var down = req.query.down;
    var direction;
    
    if (appId && appVersion)
    {
      if (up == "" && down == "")
      {
        appLogger.error("Both up and down parameters can not be passed");
        res.status(400).send("Both up and down parameters can not be passed");
        return;
      }
      if (up == "")
      {
        direction = "up";
      }
      if (down == "")
      {
        direction = "down";
      }

      var installStatus = installAppStatusMap[appId + ":" + appVersion];
      var deployStatus = deployAppStatusMap[appId + ":" + appVersion];

	  if (!installStatus || !deployStatus)
	  {
	   res.status(404).send("Requested scale of application for app-id or app-version is not presently installed or deployed");
	   appLogger.error("Requested scale of application for appId=" + appId + " and appVersion=" 
	                  + appVersion + " is not presently installed");
	   return;
	  }  

      appLogger.info("installStatus=" + JSON.stringify(installStatus));
      appLogger.info("deployStatus=" + JSON.stringify(deployStatus));

      if ((installStatus.stateCode.code != GlobalsConsts.APP_STATE_COMPLETE_INSTALL.code) &&
          (installStatus.resultCode.code != GlobalsConsts.RESULT_OK.code))
      {
        res.status(503).send("Application installation is in progress or installation does not complete successfully, unable to scale");
        appLogger.error("Application installation for appId=" + appId +
                       " and appVersion=" + appVersion + " is in progress or installation does not complete successfully, unable to scale");
        return;
      }

      if (deployStatus && (deployStatus.resultCode.code == GlobalsConsts.RESULT_PENDING.code)) 
      {
        res.status(503).send("Application deployment is in progress, unable to scale");
        appLogger.error("Application deployment for appId=" + appId +
                       " and appVersion=" + appVersion + " is in progress, unable to scale");
        return;
      }

      res.status(201).send("Application scale is underway");

      try
      {
        var manifestData = manifestDataMap[appId + ":" + appVersion];
        if (!manifestData) {
          persistence = new Persistence(appId,appVersion);
          persistence.checkAppIdDB(function (message) {
            currentappstatus=message;
            if (currentappstatus == '1') {
              persistence.getManifestdataFromDB(function (manifestdataDB) {
                if (manifestdataDB != 'NULL') {
                  appLogger.info(' Load manifestdataDB = SUCCESS');
                  manifestData = manifestdataDB;
                  manifestDataMap[appId + ":" + appVersion] = manifestData;
                }
              });
            }
          });
        }
        var appScaler = new AppScaler(deployAppStatusMap, manifestData, password, imageName, direction, installAppPorts);
        appScaler.preProcess();
        appScaler.go();
      }
      catch (err)
      {
        appLogger.error("AppScaler encountered error, err=" + JSON.stringify(err));

        deployAppStatusMap[appId + ":" + appVersion].resultCode = err,
        deployAppStatusMap[appId + ":" + appVersion].lastChange = new Date().toISOString();

        appLogger.info("AppScaler setting appStatus=" +
                        JSON.stringify(deployAppStatusMap[appId + ":" + appVersion]));
        var deployStatusPersist = deployAppStatusMap[appId + ":" + appVersion];
        persistence = new Persistence(appId, appVersion,JSON.stringify({}),JSON.stringify(deployStatusPersist));
        persistence.setAppdeploystatusDB(function (message) {
           appLogger.info('setAppdeploystatusDB operation = ' + message);
        });

      }
    } 
    else
    {
      appLogger.error("No application app-id or app-version is specified in application deployment request");
      res.status(400).send("No application app-id or app-version is specified in application deployment request");
    } 	
   } 
);

module.exports = router;
