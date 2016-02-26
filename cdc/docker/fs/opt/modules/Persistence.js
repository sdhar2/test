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
module.exports = function(appId, appVersion, appinstallstatus, appdeploystatus, manifestdata, portlist, started)
{
  appLogger.info("Persistence.enter");

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
    appLogger.info("Persistence.createOrVerifySchemaDB.enter");
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
        return cb(new Error('Error found '));
     }
  }
  

  /**
   * Check for appId/version, if found return 1 else 0 
   */
  this.checkAppIdDB = function(cb)
  {
    appLogger.info("Persistence.checkAppIdDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var payload;
    async.series([
      function(callback) {
        pgClient.connect(function(err) {
          if (err) {
            appLogger.error('Persistence.checkAppInDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
            appLogger.info('Persistence.checkAppInDB.exit');
            return cb(0);
          }
          pgClient.query("SELECT id from application a where a.appid=$1 and a.appversion=$2", [appId, appVersion] ,function(err, result) {
            if (err) {
              appLogger.error('Persistence.checkAppIdDB, error running query on dbaascluster' + ', err=' + err);
              appLogger.info('Persistence.checkAppIdDB.exit');
              return cb(0);
            }
            if (typeof result.rows[0] != "undefined") {
              appLogger.info('Found appId=' + appId + ' and appVersion=' + appVersion + '.');
              payload=1;
              callback();
            } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
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
         appLogger.error('Persistence.checkAppIdDB, error: ' + ', err=' + err);
         appLogger.info('Persistence.checkAppIdDB.exit');
         return cb(0);
       }
       appLogger.info('Persistence.checkAppIdDB.exit');
       return cb(payload);
    });
  }

  /**
   * Get all data in DB for appId/appVersion
   */
  this.getAllFromDB = function(cb)
  {
    appLogger.info("Persistence.getAllFromDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appinstallstatus;
    var appdeploystatus;
    var manifestdata;
    var portlist;
    var started;
    async.series([
      function(callback) {
        pgClient.connect(function(err) {
          if (err) {
            appLogger.error('Persistence.getAllFromDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
            appLogger.info('Persistence.getAllFromDB.exit');
            return cb('NULL','NULL','NULL','NULL','NULL');
          }
          pgClient.query("SELECT appinstallstatus,appdeploystatus,manifestdata,portlist,started from applicationview where appid=$1 and appversion=$2", [appId, appVersion] ,function(err, result) {
            if (err) {
              appLogger.error('Persistence.getAllFromDB, error running query on dbaascluster' + ', err=' + err);
              appLogger.info('Persistence.getAllFromDB.exit');
              return cb('NULL','NULL','NULL','NULL','NULL');
            }
            if (typeof result.rows[0] != "undefined") {
              appLogger.info('Found appId=' + appId + ' and appVersion=' + appVersion + '.');
              appinstallstatus=JSON.parse(result.rows[0].appinstallstatus);
              appdeploystatus=JSON.parse(result.rows[0].appdeploystatus);
              manifestdata=JSON.parse(result.rows[0].manifestdata);
              portlist=JSON.parse(result.rows[0].portlist);
              started=result.rows[0].started;
              callback();
            } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL','NULL','NULL','NULL','NULL');
            }
            pgClient.end();
          });
        });
      },
      function(callback) {
        return cb(appinstallstatus,appdeploystatus,manifestdata,portlist,started);
      }
    ], function(err) {
       if (err) {
         appLogger.error('Persistence.getAllFromDB, error: ' + ', err=' + err);
         appLogger.info('Persistence.getAllFromDB.exit');
         return cb('NULL','NULL','NULL','NULL','NULL');
       }
       appLogger.info('Persistence.getAllFromDB.exit');
       return cb(appinstallstatus,appdeploystatus,manifestdata,portlist,started);
    });
  }

  /**
   * Get appinstallstatus data in DB for appId/appVersion
   */
  this.getAppinstallstatusFromDB = function(cb)
  {
    appLogger.info("Persistence.getAppinstallstatusFromDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appinstallstatus;
    async.series([
      function(callback) {
        pgClient.connect(function(err) {
          if (err) {
            appLogger.error('Persistence.getAppinstallstatusFromDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
            appLogger.info('Persistence.getAppinstallstatusFromDB.exit');
            return cb('NULL');
          }
          pgClient.query("SELECT appinstallstatus from applicationview where appid=$1 and appversion=$2", [appId, appVersion] ,function(err, result) {
            if (err) {
              appLogger.error('Persistence.getAppinstallstatusFromDB, error running query on dbaascluster' + ', err=' + err);
              appLogger.info('Persistence.getAppinstallstatusFromDB.exit');
              return cb('NULL');
            }
            if (typeof result.rows[0] != "undefined") {
              appLogger.info('Found appId=' + appId + ' and appVersion=' + appVersion + '.');
              appinstallstatus=JSON.parse(result.rows[0].appinstallstatus);
              callback();
            } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
            }
            pgClient.end();
          });
        });
      },
      function(callback) {
        return cb(appinstallstatus);
      }
    ], function(err) {
       if (err) {
         appLogger.error('Persistence.getAppinstallstatusFromDB, error: ' + ', err=' + err);
         appLogger.info('Persistence.getAppinstallstatusFromDB.exit');
         return cb('NULL');
       }
       appLogger.info('Persistence.getAppinstallstatusFromDB.exit');
       return cb(appinstallstatus);
    });
  }

  /**
   * Get appdeploystatus data in DB for appId/appVersion
   */
  this.getAppdeploystatusFromDB = function(cb)
  {
    appLogger.info("Persistence.getAppdeploystatusFromDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appdeploystatus;
    async.series([
      function(callback) {
        pgClient.connect(function(err) {
          if (err) {
            appLogger.error('Persistence.getAppdeploystatusFromDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
            appLogger.info('Persistence.getAppdeploystatusFromDB.exit');
            return cb('NULL');
          }
          pgClient.query("SELECT appdeploystatus from applicationview where appid=$1 and appversion=$2", [appId, appVersion] ,function(err, result) {
            if (err) {
              appLogger.error('Persistence.getAppdeploystatusFromDB, error running query on dbaascluster' + ', err=' + err);
              appLogger.info('Persistence.getAppdeploystatusFromDB.exit');
              return cb('NULL');
            }
            if (typeof result.rows[0] != "undefined") {
              appLogger.info('Found appId=' + appId + ' and appVersion=' + appVersion + '.');
              appdeploystatus=JSON.parse(result.rows[0].appdeploystatus);
              callback();
            } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
            }
            pgClient.end();
          });
        });
      },
    ], function(err) {
       if (err) {
         appLogger.error('Persistence.getAppdeploystatusFromDB, error: ' + ', err=' + err);
         appLogger.info('Persistence.getAppdeploystatusFromDB.exit');
         return cb('NULL');
       }
       appLogger.info('Persistence.getAppdeploystatusFromDB.exit');
       return cb(appdeploystatus);
    });
  }

  /**
   * Get manifestdata in DB for appId/appVersion
   */
  this.getManifestdataFromDB = function(cb)
  {
    appLogger.info("Persistence.getManifestdataFromDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var manifestdata;
    try {
        pgClient.connect(function(err) {
          if (err) {
            appLogger.error('Persistence.getManifestdataFromDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
            appLogger.info('Persistence.getManifestdataFromDB.exit');
            return cb('NULL');
          }
          pgClient.query("SELECT manifestdata from applicationview where appid=$1 and appversion=$2", [appId, appVersion] ,function(err, result) {
            if (err) {
              appLogger.error('Persistence.getManifestdataFromDB, error running query on dbaascluster' + ', err=' + err);
              appLogger.info('Persistence.getManifestdataFroMDB.exit');
              return cb('NULL');
            }
            if (typeof result.rows[0] != "undefined") {
              appLogger.info('Found appId=' + appId + ' and appVersion=' + appVersion + '.');
              manifestdata=JSON.parse(result.rows[0].manifestdata);
              return cb(manifestdata); 
            } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
            }
            pgClient.end();
          });
        });
    }
    catch (err) {
         appLogger.error('Persistence.getManifestdataFromDB, error: ' + ', err=' + err);
         appLogger.info('Persistence.getManifestdataFromDB.exit');
         return cb('NULL');
    }
  }

  /**
   * Get portlist in DB for appId/appVersion
   */
  this.getPortlistFromDB = function(cb)
  {
    appLogger.info("Persistence.getPortlistFromDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var portlist;
    async.series([
      function(callback) {
        pgClient.connect(function(err) {
          if (err) {
            appLogger.error('Persistence.getPortlistFromDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
            appLogger.info('Persistence.getPortlistFromDB.exit');
            return cb('NULL');
          }
          pgClient.query("SELECT portlist from applicationview where appid=$1 and appversion=$2", [appId, appVersion] ,function(err, result) {
            if (err) {
              appLogger.error('Persistence.getPortlistFromDB, error running query on dbaascluster' + ', err=' + err);
              appLogger.info('Persistence.getPortlistFromDB.exit');
              return cb('NULL');
            }
            if (typeof result.rows[0] != "undefined") {
              appLogger.info('Found appId=' + appId + ' and appVersion=' + appVersion + '.');
              portlist=JSON.parse(result.rows[0].portlist);
              callback();
            } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
            }
            pgClient.end();
          });
        });
      },
      function(callback) {
        return cb(portlist);
      }
    ], function(err) {
       if (err) {
         appLogger.error('Persistence.getPortlistFromDB, error: ' + ', err=' + err);
         appLogger.info('Persistence.getPortlistFromDB.exit');
         return cb('NULL');
       }
       appLogger.info('Persistence.getPortlistFromDB.exit');
       return cb(portlist);
    });
  }

  /**
   * Get 'started' timestamp in DB for appId/appVersion
   */
  this.getStartedFromDB = function(cb)
  {
    appLogger.info("Persistence.getStartedFromDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var started;
    async.series([
      function(callback) {
        pgClient.connect(function(err) {
          if (err) {
            appLogger.error('Persistence.getStartedFromDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
            appLogger.info('Persistence.getStartedFromDB.exit');
            return cb('NULL');
          }
          pgClient.query("SELECT started from applicationview where appid=$1 and appversion=$2", [appId, appVersion] ,function(err, result) {
            if (err) {
              appLogger.error('Persistence.getStartedFromDB, error running query on dbaascluster' + ', err=' + err);
              appLogger.info('Persistence.getStartedFromDB.exit');
              return cb('NULL');
            }
            if (typeof result.rows[0] != "undefined") {
              appLogger.info('Found appId=' + appId + ' and appVersion=' + appVersion + '.');
              started=result.rows[0].started;
              callback();
            } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
            }
            pgClient.end();
          });
        });
      },
      function(callback) {
        return cb(started);
      }
    ], function(err) {
       if (err) {
         appLogger.error('Persistence.getStartedFromDB, error: ' + ', err=' + err);
         appLogger.info('Persistence.getStartedFromDB.exit');
         return cb('NULL');
       }
       appLogger.info('Persistence.getStartedFromDB.exit');
       return cb(started);
    });
  }

  /**
   * Persist data in datastore for appId/version
   */
   this.persist = function(cb)
  {
    appLogger.info("Persistence.persist.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appIdExists;
    try { 
        this.checkAppIdDB(function (message) {
          appIdExists=message;
         // appLogger.info('App Id exists =' + appIdExists);
          if (appIdExists == '0') {
            async.series([
             function(callback) {
               pgClient.connect(function(err) {
                 if (err) {
                   appLogger.error('Persistence.persist, error connecting to postgresql at dbaascluster' + ', err=' + err);
                   appLogger.info('Persistence.persist.exit');
                   return cb('ERROR');
                 }
                 appLogger.info('appinstallstatus = ' + appinstallstatus);
                 appLogger.info('appdeploystatus = ' + appdeploystatus);
                 appLogger.info('manifestdata = ' + manifestdata);
                 appLogger.info('portlist = ' + portlist);
                 appLogger.info('started = ' + started);
                 pgClient.query("INSERT INTO applicationview (appid, appversion,appinstallstatus,appdeploystatus,manifestdata,portlist,started) VALUES ($1, $2, $3, $4, $5, $6, $7)", [appId, appVersion,appinstallstatus,appdeploystatus,manifestdata,portlist,started] ,function(err, result) {
                   if (err) {
                     appLogger.error('Persistence.persist, error running query on dbaascluster' + ', err=' + err);
                     appLogger.info('Persistence.persist.exit');
                     return cb('ERROR');
                   }
                   payload='OK';
                   callback();
                   pgClient.end();
                 });
               });
             },
             function(callback) {
               return cb(payload);
             }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.persist, error: ' + ', err=' + err);
                appLogger.info('Persistence.persist.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.persist.exit');
              return cb(payload);
            });
          } else {
            /* update entry with new status */
            async.series([
              function(callback) {
                pgClient.connect(function(err) {
                  if (err) {
                    appLogger.error('Persistence.persist, error connecting to postgresql at dbaascluster' + ', err=' + err);
                    appLogger.info('Persistence.persist.exit');
                    return cb('ERROR');
                  }
                  pgClient.query("UPDATE applicationview SET appinstallstatus=$3, appdeploystatus=$4,manifestdata=$5,portlist=$6,started=$6 where appid=$1 and appversion=$2", [appId, appVersion,appinstallstatus,appdeploystatus,manifestdata,portlist,started] ,function(err, result) {
                    if (err) {
                      appLogger.error('Persistence.persist, error running query on dbaascluster' + ', err=' + err);
                      appLogger.info('Persistence.persist.exit');
                      return cb('ERROR');
                    }
                    payload='Updated';
                    callback();
                    pgClient.end();
                  });
                });
              },
              function(callback) {
                return cb(payload);
              }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.persist, error: ' + ', err=' + err);
                appLogger.info('Persistence.persist.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.persist.exit');
              return cb(payload);
            });
          }
        });
     }
     catch (err) {
        appLogger.error('Peristence.persist, error, err='+err);
        appLogger.info('Persistence.persist.exit');
        return cb(new Error('Error found '));
     }
  }

  /**
   * Set appinstallstatus in datastore for appId/version
   */
   this.setAppinstallstatusDB = function(cb)
  {
    appLogger.info("Persistence.setAppinstallstatusDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appIdExists;
    try {
        this.checkAppIdDB(function (message) {
          appIdExists=message;
       //   appLogger.info('App Id exists =' + appIdExists);
          if (appIdExists == '1') {
            /* update entry with new status */
            async.series([
              function(callback) {
                pgClient.connect(function(err) {
                  if (err) {
                    appLogger.error('Persistence.setAppinstallstatusDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
                    appLogger.info('Persistence.setAppinstallstatusDB.exit');
                    return cb('ERROR');
                  }
                  pgClient.query("UPDATE applicationview SET appinstallstatus=$3 where appid=$1 and appversion=$2", [appId, appVersion,appinstallstatus] ,function(err, result) {
                    if (err) {
                      appLogger.error('Persistence.setAppinstallstatusDB, error running query on dbaascluster' + ', err=' + err);
                      appLogger.info('Persistence.setAppinstallstatusDB.exit');
                      return cb('ERROR');
                    }
                    payload='Updated';
                    callback();
                    pgClient.end();
                  });
                });
              },
              function(callback) {
                return cb(payload);
              }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.setAppinstallstatusDB, error: ' + ', err=' + err);
                appLogger.info('Persistence.setAppinstallstatusDB.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.setAppinstallstatusDB.exit');
              return cb(payload);
            });
          } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
          }
        });
     }
     catch (err) {
        appLogger.error('Persistence.setAppinstallstatusDB, error, err='+err);
        appLogger.info('Persistence.setAppinstallstatusDB.exit');
        return cb(new Error('Error found '));
     }
  }

  /**
   * Set appdeploystatus in datastore for appId/version
   */
  this.setAppdeploystatusDB = function(cb)
  {
    appLogger.info("Persistence.setAppdeploystatusDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appIdExists;
    try {
        this.checkAppIdDB(function (message) {
          appIdExists=message;
     //     appLogger.info('App Id exists =' + appIdExists);
          if (appIdExists == '1') {
            /* update entry with new status */
            async.series([
              function(callback) {
                pgClient.connect(function(err) {
                  if (err) {
                    appLogger.error('Persistence.setAppdeploystatusDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
                    appLogger.info('Persistence.setAppdeploystatusDB.exit');
                    return cb('ERROR');
                  }
                  pgClient.query("UPDATE applicationview SET appdeploystatus=$3 where appid=$1 and appversion=$2", [appId, appVersion,appdeploystatus] ,function(err, result) {
                    if (err) {
                      appLogger.error('Persistence.setAppdeploystatusDB, error running query on dbaascluster' + ', err=' + err);
                      appLogger.info('Persistence.setAppdeploystatusDB.exit');
                      return cb('ERROR');
                    }
                    payload='Updated';
                    callback();
                    pgClient.end();
                  });
                });
              },
              function(callback) {
                return cb(payload);
              }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.setAppdeploystatusDB, error: ' + ', err=' + err);
                appLogger.info('Persistence.setAppdeploystatusDB.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.setAppdeploystatusDB.exit');
              return cb(payload);
            });
          } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
          }
        });
     }
     catch (err) {
        appLogger.error('Persistence.setAppdeploystatusDB, error, err='+err);
        appLogger.info('Persistence.setAppdeploystatusDB.exit');
        return cb(new Error('Error found '));
     }
  }

  /**
   * Set manifestdata in datastore for appId/version
   */
   this.setManifestdataInDB = function(cb)
  {
    appLogger.info("Persistence.setManifestdataDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appIdExists;
    try {
        this.checkAppIdDB(function (message) {
          appIdExists=message;
      //    appLogger.info('App Id exists =' + appIdExists);
          if (appIdExists == '1') {
            /* update entry with new manifest */
            async.series([
              function(callback) {
                pgClient.connect(function(err) {
                  if (err) {
                    appLogger.error('Persistence.setManifestdataDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
                    appLogger.info('Persistence.setManifestdataDB.exit');
                    return cb('ERROR');
                  }
                  pgClient.query("UPDATE applicationview SET manifestdata=$3 where appid=$1 and appversion=$2", [appId, appVersion,manifestdata] ,function(err, result) {
                    if (err) {
                      appLogger.error('Persistence.setManifestdataDB, error running query on dbaascluster' + ', err=' + err);
                      appLogger.info('Persistence.setManifestdataDB.exit');
                      return cb('ERROR');
                    }
                    payload='Updated';
                    callback();
                    pgClient.end();
                  });
                });
              },
              function(callback) {
                return cb(payload);
              }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.setManifestdataDB, error: ' + ', err=' + err);
                appLogger.info('Persistence.setManifestdataDB.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.setManifestdataDB.exit');
              return cb(payload);
            });
          } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
          }
        });
     }
     catch (err) {
        appLogger.error('Persistence.setManifestdataDB, error, err='+err);
        appLogger.info('Persistence.setManifestdataDB.exit');
        return cb(new Error('Error found '));
     }
  }

  /**
   * Set portlist in datastore for appId/version
   */
   this.setPortlistDB = function(cb)
  {
    appLogger.info("Persistence.setPortlistDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appIdExists;
    try {
        this.checkAppIdDB(function (message) {
          appIdExists=message;
       //   appLogger.info('App Id exists =' + appIdExists);
          if (appIdExists == '1') {
            /* update entry with new manifest */
            async.series([
              function(callback) {
                pgClient.connect(function(err) {
                  if (err) {
                    appLogger.error('Persistence.setPortlistDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
                    appLogger.info('Persistence.setPortlistDB.exit');
                    return cb('ERROR');
                  }
                  pgClient.query("UPDATE applicationview SET portlist=$3 where appid=$1 and appversion=$2", [appId, appVersion,portlist] ,function(err, result) {
                    if (err) {
                      appLogger.error('Persistence.setPortlistDB, error running query on dbaascluster' + ', err=' + err);
                      appLogger.info('Persistence.setPortlistDB.exit');
                      return cb('ERROR');
                    }
                    payload='Updated';
                    callback();
                    pgClient.end();
                  });
                });
              },
              function(callback) {
                return cb(payload);
              }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.setPortlistDB, error: ' + ', err=' + err);
                appLogger.info('Persistence.setPortlistDB.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.setPortlistDB.exit');
              return cb(payload);
            });
          } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
          }
        });
     }
     catch (err) {
        appLogger.error('Persistence.setPortlistDB, error, err='+err);
        appLogger.info('Persistence.setPortlistDB.exit');
        return cb(new Error('Error found '));
     }
  }

  /**
   * Set started in datastore for appId/version
   */
   this.setStartedDB = function(cb)
  {
    appLogger.info("Persistence.setStartedDB.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appIdExists;
    try {
        this.checkAppIdDB(function (message) {
          appIdExists=message;
      //    appLogger.info('App Id exists =' + appIdExists);
          if (appIdExists == '1') {
            /* update entry with new manifest */
            async.series([
              function(callback) {
                pgClient.connect(function(err) {
                  if (err) {
                    appLogger.error('Persistence.setStartedDB, error connecting to postgresql at dbaascluster' + ', err=' + err);
                    appLogger.info('Persistence.setStartedDB.exit');
                    return cb('ERROR');
                  }
                  pgClient.query("UPDATE applicationview SET started=$3 where appid=$1 and appversion=$2", [appId, appVersion,started] ,function(err, result) {
                    if (err) {
                      appLogger.error('Persistence.setStartedDB, error running query on dbaascluster' + ', err=' + err);
                      appLogger.info('Persistence.setStartedDB.exit');
                      return cb('ERROR');
                    }
                    payload='Updated';
                    callback();
                    pgClient.end();
                  });
                });
              },
              function(callback) {
                return cb(payload);
              }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.setStartedDB, error: ' + ', err=' + err);
                appLogger.info('Persistence.setStartedDB.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.setStartedDB.exit');
              return cb(payload);
            });
          } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
          }
        });
     }
     catch (err) {
        appLogger.error('Persistence.setStartedDB, error, err='+err);
        appLogger.info('Persistence.setStartedDB.exit');
        return cb(new Error('Error found '));
     }
  }

  /**
   * Delete from datastore appId/version
   */
   this.delete = function(cb)
  {
    appLogger.info("Persistence.delete.enter");
    var cdcpw = getPassword('cdc');
    var connString = "postgres://cdc:"+cdcpw+"@dbaascluster:9999/cdc";
    var pgClient = new postgresql.Client(connString);
    var appIdExists;
    try {
        this.checkAppIdDB(function (message) {
          appIdExists=message;
    //      appLogger.error('App Id exists =' + appIdExists);
          if (appIdExists == '1') {
            /* delete entry, delete from main table cascades */
            async.series([
              function(callback) {
                pgClient.connect(function(err) {
                  if (err) {
                    appLogger.error('Persistence.delete connecting to postgresql at dbaascluster' + ', err=' + err);
                    appLogger.info('Persistence.delete.exit');
                    return cb('ERROR');
                  }
                  pgClient.query("DELETE FROM application where appid=$1 and appversion=$2", [appId, appVersion] ,function(err, result) {
                    if (err) {
                      appLogger.error('Persistence.delete, error running query on dbaascluster' + ', err=' + err);
                      appLogger.info('Persistence.delete.exit');
                      return cb('ERROR');
                    }
                    payload='Deleted';
                    callback();
                    pgClient.end();
                  });
                });
              },
              function(callback) {
                return cb(payload);
              }
            ], function(err) {
              if (err) {
                appLogger.error('Persistence.delete, error: ' + ', err=' + err);
                appLogger.info('Persistence.delete.exit');
                return cb('ERROR');
              }
              appLogger.info('Persistence.delete.exit');
              return cb(payload);
            });
          } else {
              appLogger.info('Did not find appId=' + appId + ' and appVersion=' + appVersion + '.');
              return cb('NULL');
          }
        });
     }
     catch (err) {
        appLogger.error('Persistence.delete, error, err='+err);
        appLogger.info('Persistence.delete.exit');
        return cb(new Error('Error found '));
     }
  }
}
