/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module parses the ACP application manifest file for installation
 * and deployment to form a JSON object
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var fs = require('fs');
var AppInstallError = require('./AppInstallError');
var GlobalsConsts = require('../modules/GlobalsConsts');
var execSync = require('exec-sync');

/**
 * Module class definition
 */
module.exports = function(releasFileName, manifestFileName) 
{
  appLogger.info("ManifestFileParser.enter, releasFileName=" + releasFileName + ", manifestFileName=" + manifestFileName);

  this.releasFileName = releasFileName;
  this.manifestFileName = manifestFileName;
  
  this.parse = function() 
  {
    appLogger.info("ManifestFileParser.parse.enter");
    var content;

    try
    {
      var command = "unzip -q -c " + this.releasFileName + " " + this.manifestFileName;
      content = execSync(command);
      appLogger.error("ManifestFileParser.parse, manifest file content is:\r\n" + content);
    }
    catch (err)
    {
      appLogger.error("ManifestFileParser.parse, error openning manifest file=" + this.manifestFileName + ", err=" + err);
      appLogger.info("ManifestFileParser.parse.exit");
      throw GlobalsConsts.RESULT_FILE_NOT_FOUND;
    }

    try
    {
      var manifestData = JSON.parse(content);
      return manifestData;
    }
    catch (err)
    {
      appLogger.error("ManifestFileParser.parse, error parsing manifest file=" + this.manifestFileName + ", err=" + err);
      throw GlobalsConsts.RESULT_MANIFEST_PARSE_ERROR;
    }
    finally
    {
      appLogger.info("ManifestFileParser.parse.exit");
    }
  }
}
