/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module parses and validates the manifest file, ingests the application source 
 * artifacts and installs the docker images into dockerrepo registry
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var DockerAPI = require('../modules/DockerAPI');
var ManifestFileParser = require('../modules/ManifestFileParser');
var AppInstallError = require('../modules/AppInstallError');
var ManifestFileValidator = require('../modules/ManifestFileValidator');
var Persistence = require('../modules/Persistence');
var GlobalsConsts = require('../modules/GlobalsConsts');
var fs = require('fs');
var unzip = require('unzip');
var rimraf = require('rimraf');
var mkdirp = require("mkdirp");

/**
 * Constants
 */
const RELEASE_FILEPATH = "/opt/code_controller/releases"; 
const MANIFEST_FILENAME = "manifest.json";

/**
 * Globals
 */
var releaseFilename;
var releaseFileUnzipPath;
var manifestFileName;
var manifestDataMapRef;
var appStatusMapRef;
var manifestData;
var manifestFileValidator;
var installInProgressRef;

/**
 * Module class definition 
 */
module.exports = function(releaseFile, manifestDataMap, appStatusMap, deployAppStatusMap, installInProgress) 
{
  appLogger.info("AppInstaller.enter, releaseFile=" + releaseFile);

  this.releaseFile = releaseFile;
  manifestDataMapRef = manifestDataMap;
  appStatusMapRef = appStatusMap;
  deployAppStatusMapRef = deployAppStatusMap;
  installInProgressRef = installInProgress; 

  var persistence;

  /**
   * Pre-process the release file
   */
  this.preProcessReleaseFile = function()
  {
    appLogger.info("AppInstaller.preProcessReleaseFile.enter");
    releaseFilename = RELEASE_FILEPATH + "/" + this.releaseFile;

    try
    {
      fs.statSync(releaseFilename);
    }
    catch (err)
    {
      appLogger.error("AppInstaller.preProcessReleaseFile, error openning release file=" + releaseFilename +
                      ", err=" + err);
      appLogger.info("AppInstaller.preProcessReleaseFile.exit");
      throw GlobalsConsts.RESULT_FILE_NOT_FOUND;
    }

    try
    {
      //synchronously read and parse manifest file without unzipping the release file 
      var manifestFileParser = new ManifestFileParser(releaseFilename, MANIFEST_FILENAME);
      manifestData = manifestFileParser.parse();
      
      // Validate the required fields in the manifest file before doing anything else
      manifestFileValidator = new ManifestFileValidator(manifestData);
      manifestFileValidator.validateAppIdAndVersion();

      var appId = manifestData.manifest.app.id;
      var appVersion = manifestData.manifest.app.version;

      appLogger.info("AppInstaller.preProcessReleaseFile, successfully parsed manifest file, appId=" + 
                     appId + ", version=" + appVersion);

      //add manifestData to manifestDataMap
      manifestDataMapRef[appId + ":" + appVersion] = manifestData;

      //validate resource and scale configuraion in manifest
      var resourceScaleData = manifestFileValidator.validateResourceScale();
    }
    catch (err) {
      appLogger.error("AppInstaller.validateResourceScale, error validating manifest file=" + releaseFilename +
                      ", err=" + err);
      appLogger.info("AppInstaller.validateResourceScale.exit");
      throw GlobalsConsts.MANIFEST_PARSE_ERROR;
    }
    try {
      //set initial status in app status map
      var appStatus = {type: GlobalsConsts.TASK_TYPE_INSTALL,
                       started: new Date().toISOString(),
                       stateCode: GlobalsConsts.APP_STATE_START_INSTALL, 
                       resultCode: GlobalsConsts.RESULT_PENDING, 
                       lastChange: new Date().toISOString()};
      appLogger.info("appStatus = "+JSON.stringify(appStatus));
      appLogger.info("appStatusMapRef="+JSON.stringify(appStatusMapRef));

      appStatusMapRef[appId + ":" + appVersion] = appStatus;
      appLogger.info("Adds appStatus successfully."); 

/* Persist app status */
      var appdeployStatus = {};  
      var portlist = {};
      var started = new Date().toISOString();
      var curentappstatus;
      var newpersistence = new Persistence(appId, appVersion, JSON.stringify(appStatus),JSON.stringify(appdeployStatus),JSON.stringify(manifestData),JSON.stringify(portlist),started);
      newpersistence.checkOrVerifySchemaDB(function (message) {
        checkschema=message;
        appLogger.info('Schema check result = '+checkschema);
        newpersistence.checkAppIdDB(function (message) {
          currentappstatus=message;
          if (currentappstatus == '1') {
            appLogger.info('I found the appid/version in the database. Updating install status.');
            newpersistence.setAppinstallstatusDB(function (message) {
              appLogger.info('SetAppInstallStatusDB operation = ' + message);
            });
          } else {
            appLogger.info('I did not find the appid/version in the database. Persisting new entry.');
            newpersistence.persist(function (message) {
              appLogger.info('Persistence operation = ' + message);
            });
          }
        });
      });

      appLogger.info("AppInstaller.preProcessReleaseFile, persisting initial appStatus=" +
                     JSON.stringify(appStatus));
    }
    catch (err) {
      appLogger.error('UserManager.preProcessReleaseFile, error persisting intitial appStatus, err='+err);
      appLogger.info('UserManager.preProcessReleaseFile.exit');
    }
    try
    {
      //return content body for HTTP response
      var appData = {id:appId, version:appVersion, 
                     scale:resourceScaleData.scaleData, 
                     resources:resourceScaleData.resourceData};

      return {$schema: "/schemas/App/v1.0",
              App:appData};
    }
    catch (err) {
      appLogger.error('UserManager.preProcessReleaseFile, error, err='+err);
      appLogger.info('UserManager.preProcessReleaseFile.exit');
    }
    finally
    {
      appLogger.info("AppInstaller.preProcessReleaseFile.exit");
    }
  }
 
  /**
   * Build release file folders
   */
  this.buildReleaseFileFolders = function()
  {
    appLogger.info("AppInstaller.buildReleaseFileFolders.enter");

    //update status in app status map
    var appId = manifestData.manifest.app.id;
    var appVersion = manifestData.manifest.app.version;

    appStatusMapRef[appId + ":" + appVersion].stateCode = GlobalsConsts.APP_STATE_PROCESS_RELEASEFILE,
    appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
    appLogger.info("AppInstaller.buildReleaseFileFolders, changing appStatus to: appStatus=" + 
                   JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));

/* Persist app status */
    persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
    persistence.setAppinstallstatusDB(function (message) {
      appLogger.info('setAppinstallstatusDB operation = ' + message);
    });

    releaseFileUnzipPath = RELEASE_FILEPATH + "/" + appId + "/" + appVersion;
    manifestFileName = releaseFileUnzipPath + "/" + MANIFEST_FILENAME;

    appLogger.info("AppInstaller.buildReleaseFileFolders" + 
                   ", releaseFilename=" + releaseFilename + ", releaseFileUnzipPath=" + releaseFileUnzipPath +
                   ", manifestFileName=" + manifestFileName);

    try
    {
      var fsStats = fs.statSync(releaseFileUnzipPath);
      if (fsStats.isDirectory())
      {
        appLogger.info("AppInstaller.buildReleaseFileFolders, releaseFileUnzipPath=" + releaseFileUnzipPath +
                     " exists, removing and re-creating");
        rimraf.sync(releaseFileUnzipPath);
        mkdirp.sync(releaseFileUnzipPath);
      }
    }
    catch (err)
    {
      appLogger.error("AppInstaller.buildReleaseFileFolders, releaseFileUnzipPath=" + releaseFileUnzipPath +
                     " does not exist, creating");
      mkdirp.sync(releaseFileUnzipPath); 
    }
    finally
    {
      appLogger.info("AppInstaller.buildReleaseFileFolders.exit");
    }
  }

  /**
   * Class main in a go
   */ 
  this.go = function() 
  {
    appLogger.info("AppInstaller.go.enter");

    try
    {
    	manifestFileValidator.validate();
    }
    catch (err)
    {
    	appLogger.error("AppInstaller.go, error validating manifest file, err=" + err);
    	
    	//update status in app status map
    	var appId = manifestData.manifest.app.id;
    	var appVersion = manifestData.manifest.app.version;

    	appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR,
    	appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
    	appLogger.info("AppInstaller.go, setting appStatus=" +
    			JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));

/* Persist app status */
        persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppinstallstatusDB(function (message) {
          appLogger.info('setAppinstallstatusDB operation = ' + message);
        });

    	installInProgress.inProgress = false;
    	return;
    }
    
    this.buildReleaseFileFolders();

    var unzipExtractor = unzip.Extract({path: releaseFileUnzipPath});
    fs.createReadStream(releaseFilename).pipe(unzipExtractor);

    unzipExtractor.on('error',
      function(err)
      {
        appLogger.error("AppInstaller.go, error unzipping release file=" + releaseFilename +
                       "err=" + err);

        //update status in app status map
        var appId = manifestData.manifest.app.id;
        var appVersion = manifestData.manifest.app.version;

        appStatusMapRef[appId + ":" + appVersion].resultCode = GlobalsConsts.RESULT_FILE_UNZIP_ERROR,
        appStatusMapRef[appId + ":" + appVersion].lastChange = new Date().toISOString();
        appLogger.info("AppInstaller.go, setting appStatus=" +
                       JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
/* Persist app status */
        persistence = new Persistence(appId, appVersion, JSON.stringify(appStatusMapRef[appId + ":" + appVersion]));
        persistence.setAppinstallstatusDB(function (message) {
          appLogger.info('setAppinstallstatusDB operation = ' + message);
        });
        installInProgress.inProgress = false;
      }
    );

    unzipExtractor.on('close', 
      function()
      {
        appLogger.info("AppInstaller.go, successfully unzipped release file=" + releaseFilename);

        try
        {
          var appId = manifestData.manifest.app.id;
          var appVersion = manifestData.manifest.app.version;
          var dockerAPI = new DockerAPI(manifestData, appStatusMapRef, installInProgress);
          dockerAPI.load(releaseFileUnzipPath);
          delete deployAppStatusMapRef[appId + ":" + appVersion];
          var deployStatusPersist = {};
          persistence = new Persistence(appId, appVersion,JSON.stringify({}),JSON.stringify(deployStatusPersist));
          persistence.setAppdeploystatusDB(function (message) {
            appLogger.info('setAppdeploystatusDB operation = ' + message);
          });
        }
        finally 
        {
          appLogger.info("AppInstaller.go.exit");
        }
      }
    );
  }
}
