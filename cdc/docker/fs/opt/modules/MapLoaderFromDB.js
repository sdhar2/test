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
var postgresql = require('pg');
var fs = require('fs');
var GlobalsConsts = require('../modules/GlobalsConsts');
var execSync = require('exec-sync');
var async = require('async');

/**
 * Global variables
 */

/**
 * Module class definition
 */
module.exports = function(installAppStatusMap,deployAppStatusMap,installAppPorts)
{
  appLogger.info("MapLoaderFromDB.enter");

  /**
   * Function to grab csc database password from openssl
   */
  function getPassword(type)
  {
    var opensslCmd = '/usr/bin/openssl rsautl -inkey /opt/keys/key.txt -decrypt < /opt/keys/output.bin';
    var child = execSync(opensslCmd).split(' ');
    return child[0];
  }

  function fileExists(filePath)
  {
    try {
      return fs.statSync(filePath).isFile();
    }
    catch (err) {
        return false;
    }
  }

  /**
   * Check for existence of DB schema. If applicationview exists, 1, else 0 
   */
  this.checkSchemaDB= function(cb)
  {
    appLogger.info("Persistence.checkSchemaDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var payload;
    async.series([
      function(callback) {
        pgClient.connect(function(err) {
          if (err) {
            appLogger.error('Persistence.checkSchemaDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
            appLogger.info('Persistence.checkAppInDB.exit');
            return cb(0);
          }
          pgClient.query("SELECT relname from pg_class a where relname='applicationview'", function(err, result) {
            if (err) {
              appLogger.error('Persistence.checkSchemaDB, error running query on dbaascluster' + ', err=' + err);
              appLogger.info('Persistence.checkSchemaDB.exit');
              return cb(0);
            }
            if (typeof result.rows[0] != "undefined") {
              appLogger.info('Found cdc schema.');
              payload=1;
              callback();
            } else {
              appLogger.info('Did not find cdc schema.');
              return cb(0);
            }
            pgClient.end();
          });
        });
      },
      function(callback) {
        return cb(payload);
      }
    ], function(err) {
       if (err) {
         appLogger.error('Persistence.checkSchemaDB, error: ' + ', err=' + err);
         appLogger.info('Persistence.checkSchemaDB.exit');
         return cb(0);
       }
       appLogger.info('Persistence.checkSchemaDB.exit');
       return cb(payload);
    });
  }

  /**
   * Create or verify existence of DB schema.  If not found, create it.
   */
  this.checkOrVerifySchemaDB= function(cb)
  {
    appLogger.info("Persistence.createOfVerifySchemaDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var cdcschema;
    var payload;
    try {
        this.checkSchemaDB(function (message) {
          schemaExists=message;
          appLogger.info('Schema exists =' + schemaExists);
          if (schemaExists == '0') {
            async.series([
             function(callback) {
               schemaFileExists = fileExists('/opt/dbschema/cdcschema.sql');
               if (schemaFileExists) {
                 appLogger.info('CDC schema file found.')
                 cdcschema = fs.readFileSync('/opt/dbschema/cdcschema.sql').toString();
                 callback();
               } else {
                 appLogger.info('CDC schema file not found!')
                 return cb('ERROR'); 
               }
             },
             function(callback) {
               pgClient.connect(function(err) {
                 if (err) {
                   appLogger.error('Persistence.createOrVerifySchemaDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
                   appLogger.info('Persistence.createOrVerifySchemaDB.exit');
                   return cb('ERROR');
                 }
                 pgClient.query(cdcschema ,function(err, result) {
                   if (err) {
                     appLogger.error('Persistence.createOrVerifySchemaDB, error running query on dbaascluster' + ', err=' + err);
                     appLogger.info('Persistence.createOrVerifySchemaDB.exit');
                     return cb('ERROR');
                   }
                   return cb('OK');
                   pgClient.end();
                 });
               });
             }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.createOrVerifySchemaDB, error: ' + ', err=' + err);
                appLogger.info('Persistence.createOrVerifySchemaDB.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.createOrVerifySchemaDB.exit');
              return cb(payload);
            });
          } else {
              appLogger.info('Schema was found.');
              return cb('Found');
          }
        });
     }
     catch (err) {
        appLogger.error('Persistence.createOrVerifySchemaDB, error, err='+err);
        appLogger.info('Persistence.createOrVerifySchemaDB.exit');
        return cb('ERROR');
     }
  }

  /**
   * Load all data in DB into maps 
   */
  this.load = function(cb)
  {
    appLogger.info("MapLoaderFromDB.load.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    try {
      this.checkOrVerifySchemaDB(function (message) {
        checkschema=message;
        appLogger.info('Schema check result = '+checkschema);
        if (message != 'ERROR') {
          async.series([
            function(callback) {
              pgClient.connect(function(err) {
                if (err) {
                  appLogger.error('MapLoaderFromDB.getAllFromDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
                  appLogger.info('MapLoaderFromDB.getAllFromDB.exit');
                  return cb('FAILED');
                }
                pgClient.query("SELECT appid, appversion, appinstallstatus,appdeploystatus,portlist from applicationview ORDER BY appid, appversion", function(err, result) {
                  if (err) {
                    appLogger.error('MapLoaderFromDB.load, error running query on dbaascluster' + ', err=' + err);
                    appLogger.info('MapLoaderFromDB.load.exit');
                    return cb('FAILED');
                  }
                  var appInstallStatusEntry;
                  var appDeployStatusEntry;
                  var portlistEntry;
                  var appId;
                  var appVersion;
                  if (typeof result.rows[0] != "undefined") {
                    for (var i=0;i<result.rows.length;i++) {
                      appId=result.rows[i].appid;
                      appVersion=result.rows[i].appversion;
                      appInstallStatusEntry=JSON.parse(result.rows[i].appinstallstatus);
                      if (result.rows[i].appinstallstatus !== '{}') { 
                        installAppStatusMap[appId + ":" + appVersion] = appInstallStatusEntry;
                      }
                      appDeployStatusEntry=JSON.parse(result.rows[i].appdeploystatus);
                      if (result.rows[i].appdeploystatus !== '{}') {
                        deployAppStatusMap[appId + ":" + appVersion] = appDeployStatusEntry;
                      }
                      portlistEntry=JSON.parse(result.rows[i].portlist);
                      installAppPorts[appId + ":" + appVersion] = portlistEntry;
                    } 
                    callback();
                  } else {
                    return cb('SUCCESS',installAppStatusMap,deployAppStatusMap,installAppPorts);
                  }
                  pgClient.end();
                });
              });
            },
            function(callback) {
              return cb('SUCCESS',installAppStatusMap,deployAppStatusMap,installAppPorts);
            }
          ], function(err) {
             if (err) {
               appLogger.error('MapLoaderFromDB.load, error: ' + ', err=' + err);
               appLogger.info('MapLoaderFromDB.load.exit');
               return cb('FAILED');
             }
             appLogger.error('MapLoaderFromDB.load.exit');
             return cb('SUCCESS',installAppStatusMap,deployAppStatusMap,installAppPorts);
          });
        }
      });
    }
    catch (err) {
      appLogger.info('MapLoaderFromDB.load, error, err='+err);
      appLogger.info('MapLoaderFromDB.load.exit');
      return cb(new Error('FAILED'));
    }
  }
}
