/**
 * Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
 * This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
 * and may not be copied, reproduced, modified, disclosed to others, published or used,
 * in whole or in part, without the express prior written permission of ARRIS.
 */

/**
 * This module validates the manifest file 
 */

/**
 * Import modules
 */
var appLogger = require('../utils/app_logger');
var GlobalsConsts = require('../modules/GlobalsConsts');

/**
 * Module class definition
 */
module.exports = function(manifestData) 
{
  appLogger.info("ManifestFileValidator.enter");
 
  this.manifestData = manifestData;
  
  var alphaNonSpaceWordPattern = /^[0-9a-zA-Z_-]+$/;
  var alphaWordPattern = /^[0-9a-zA-Z _-]+$/;
  var hostNamePattern = /^[0-9a-zA-Z-.~%]+$/;
  var hostNameAndPortPattern = /^[0-9a-zA-Z-.~%]+:([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/;
  var imageNamePattern = /^[0-9a-zA-Z_\-\/]+$/;
  var intPattern = /^[0-9]+$/;
  var decimalPattern = /^[0-9]+.[0-9]+$/;
  var portPattern = /^([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/;
  var portRangePattern = /^([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])-([0-9]{1,4}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5])$/;
  var envVariablePattern = /^[a-zA-Z][0-9a-zA-Z_]+$/;
  var pathPattern = /^\//;

  /**
   * validateRequiredFileds - Validates all the required fields are present in the manifest file 
   */
  this.validateAppIdAndVersion = function() 
  {
    appLogger.info("ManifestFileValidator.validateAppIdAndVersion.enter");
    
    var manifest = manifestData.manifest;
    if (!manifest)
    {
    	appLogger.error("ManifestFileValidator.validate, missing required item \"manifest\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    
    var app = manifest.app;
    if (!app)
    {
    	appLogger.error("ManifestFileValidator.validate, missing required item \"app\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
     
    var appId = app.id;
    if (!appId)
    {
    	appLogger.error("ManifestFileValidator.validate, missing required item \"id\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    if (!appId.match(alphaNonSpaceWordPattern))
    {
    	appLogger.error("ManifestFileValidator.validate, validation failed on item \"id\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    
    var appVersion = app.version;
    if (!appVersion)
    {
    	appLogger.error("ManifestFileValidator.validate, missing required item \"version\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    
    appLogger.info("ManifestFileValidator.validateAppIdAndVersion.exit");
  };
  
  /**
   * validate 
   */
  this.validate = function() 
  {
    appLogger.info("ManifestFileValidator.validate.enter");
    
    var manifest = manifestData.manifest;
     
    var manifestVersion = manifest.version;
    if (!manifestVersion)
    {
    	appLogger.error("ManifestFileValidator.validate, missing required item \"version\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    
    var app = manifest.app;
    
    var displayName = app.displayName;
    if (!displayName)
    {
    	appLogger.error("ManifestFileValidator.validate, missing required item \"displayName\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    if (!displayName.match(alphaWordPattern))
    {
    	appLogger.error("ManifestFileValidator.validate, validation failed on item \"displayName\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    
    var containers = app.containers;
    if (!containers)
    {
    	appLogger.error("ManifestFileValidator.validate, missing required item \"containers\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    for (var container in containers)
    {
    	var imageName = containers[container].imageName;
        if (!imageName)
        {
        	appLogger.error("ManifestFileValidator.validate, missing required item \"imageName\" in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
       	}
    	if (!imageName.match(imageNamePattern))
        {
        	appLogger.error("ManifestFileValidator.validate, validation failed on item \"imageName\" in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
       	}
    
        var containerVersion = containers[container].version;
        if (!containerVersion)
        {
        	appLogger.error("ManifestFileValidator.validate, missing required item \"version\" in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
       	}
        
        // Advertised Data Volumes
        var advertisedDataVolumes = containers[container].advertisedDataVolumes;
        if (advertisedDataVolumes)
        {
	        for (var volume in advertisedDataVolumes)
	        {
	        	var volumePath = advertisedDataVolumes[volume].volumePath;
	        	if (volumePath)
	            {
		            if (!volumePath.match(imageNamePattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"volumePath\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	            }
	        }
        }  
        
        // Data Volumes required from
        var dataVolumesRequiredFrom = containers[container].dataVolumesRequiredFrom;
        if (dataVolumesRequiredFrom)
        {
	        for (var volume in dataVolumesRequiredFrom)
	        {
	        	var volumeImageRef = dataVolumesRequiredFrom[volume].imageRef;
	        	if (volumeImageRef)
	            {
		            if (!volumeImageRef.match(imageNamePattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"imageRef\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	            }
	        }
        }
          
        // Image Source
        var imageSource = containers[container].imageSource;
        if (!imageSource)
        {
        	appLogger.error("ManifestFileValidator.validate, missing required item \"imageSource\" in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
       	}
        
        var imageFile = imageSource.imageFile;
        var remoteRegistry = imageSource.remoteRegistry;
        if (!remoteRegistry && !imageFile)
        {
        	appLogger.error("ManifestFileValidator.validate, missing required item \"remoteRegistry\" or \"imageFile\" under \"imageSource\" in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
       	}
        if (remoteRegistry)
        {    
        	var caFile = remoteRegistry.caFile;
            if (caFile)
            {
                if (!caFile.match(pathPattern))
                {
                	appLogger.error("ManifestFileValidator.validate, validation failed on item \"caFile\" in manifest file");
                    throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
               	}
            }
            
            var location = remoteRegistry.location;
            if (location)
            {
                if (!location.match(hostNameAndPortPattern))
                {
                	appLogger.error("ManifestFileValidator.validate, validation failed on item \"location\" in manifest file");
                    throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
               	}
            }
            
            var secureRegistry = remoteRegistry.secureRegistry;
            if (secureRegistry)
            {
                if (secureRegistry.toString() != "true" && secureRegistry.toString() != "false")
                {
                	appLogger.error("ManifestFileValidator.validate, validation failed on item \"secureRegistry\" in manifest file");
                    throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
               	}
            }
        }
        else // imageFile
        {
        	if (imageFile.charAt(0) != "/")
            {
               	appLogger.error("ManifestFileValidator.validate, validation failed on item \"imageFile\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	}
        }
                     
        // Links
        var links = containers[container].links;
        if (links)
        {
	        for (var link in links)
	        {
	        	var alias = links[link].alias;
	        	if (alias)
	        	{
		            if (!alias.match(hostNamePattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"alias\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	            
	            var linkImageRef = links[link].imageRef;
	            if (linkImageRef)
	        	{
		            if (!linkImageRef.match(imageNamePattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"imageRef\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	        }
        }
        
        // Published Ports
        var publishedPorts = containers[container].publishedPorts;
        if (publishedPorts)
        {
        	var list = publishedPorts.list
            if (list)
            {
    	        for (var listItem in list)
    	        {
    	        	var listContainer = list[listItem].container;
    	        	if (listContainer)
    	        	{
	    	            if (!listContainer.toString().match(portPattern) && !listContainer.toString().match(portRangePattern))
	    	            {
	    	            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"container\" in manifest file");
	    	                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
	    	           	}
    	        	}
    	            
    	            var host = list[listItem].host;
    	            if (host)
    	        	{
	    	            if (!host.toString().match(portPattern) && !host.toString().match(portRangePattern))
	    	            {
	    	            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"host\" in manifest file");
	    	                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
	    	           	}
    	        	}
    	        }
            }
        }
        
        // Registration
        var registrations = containers[container].registration;
        if (registrations)
        {
	        for (var registration in registrations)
	        {
	        	var serviceName = registrations[registration].serviceName;
	        	if (serviceName)
	        	{
		            if (!serviceName.match(alphaNonSpaceWordPattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"serviceName\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	            
	            var servicePort = registrations[registration].servicePort;
	            if (servicePort)
	        	{
		            if (!servicePort.toString().match(portPattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"servicePort\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	            
	            var healthCheckUrl = registrations[registration].healthCheckUrl;
	            if (healthCheckUrl)
	        	{
		            if (!healthCheckUrl.match(pathPattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"healthCheckUrl\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	        }
        }
        
        // Discovery
        var discoveries = containers[container].discovery;
        if (discoveries)
        {
	        for (var discovery in discoveries)
	        {
	        	var application = discoveries[discovery].application;
	        	if (application)
	        	{
		            if (!application.match(alphaNonSpaceWordPattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"application\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	            
	            var serviceName2 = discoveries[discovery].serviceName;
	            if (serviceName2)
	        	{
		            if (!serviceName2.match(alphaNonSpaceWordPattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"serviceName\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	            
	            var proxyPort = discoveries[discovery].proxyPort;
	            if (proxyPort)
	        	{
		            if (!proxyPort.toString().match(portPattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"proxyPort\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	        }
        }
        
        // Environment Variables
        var envVars = containers[container].envVars;
        if (envVars)
        {
	        for (var envVar in envVars)
	        {
	        	var name = envVars[envVar].name;
	        	if (name)
	        	{
		            if (!name.match(envVariablePattern))
		            {
		            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"application\" in manifest file");
		                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
		           	}
	        	}
	        }
        }
        
        // Exposed Ports
        var exposedPorts = containers[container].exposedPorts;
        if (exposedPorts)
        {
	        for (var port in exposedPorts)
	        {
	        	if (!exposedPorts[port].toString().match(portPattern) && !exposedPorts[port].toString().match(portRangePattern))
	            {
	            	appLogger.error("ManifestFileValidator.validate, validation failed on port in manifest file");
	                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
	           	}
	        }
        }   
        
        // Resources
        var resources = containers[container].resources;
        if (!resources)
        {
        	appLogger.error("ManifestFileValidator.validate, missing required item \"resources\" in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
       	}
        
        for (var resource in resources)
        { 
        	var resourcesLevel = resources[resource].level;
        	if (!resourcesLevel)
            {
            	appLogger.error("ManifestFileValidator.validate, missing required item \"level\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	}
        	       	
            var vcpus = resources[resource].vcpus;
            if (!vcpus)
            {
            	appLogger.error("ManifestFileValidator.validate, missing required item \"vcpus\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	}
            if (!vcpus.toString().match(intPattern) && vcpus > 0)
            {
            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"vcpus\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	}
            
            var memory = resources[resource].memory;
            if (!memory)
            {
            	appLogger.error("ManifestFileValidator.validate, missing required item \"memory\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	}
            if (!memory.toString().match(intPattern) && memory > 0)
            {
            	appLogger.error("ManifestFileValidator.validate, alidation failed on item \"memory\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	}
        }
        
        // Scale
        var scales = containers[container].scale;
        if (!scales)
        {
        	appLogger.error("ManifestFileValidator.validate, missing required item \"scale\" in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
       	}
        for (var scale in scales)
        {    
        	var scaleLevel = scales[scale].level;
            if (!scaleLevel)
            {
            	appLogger.error("ManifestFileValidator.validate, missing required item \"level\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	}
            
            var instances = scales[scale].instances;
            if (!instances)
            {
            	appLogger.error("ManifestFileValidator.validate, missing required item \"instances\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	} 
            if (!instances.toString().match(intPattern) && instances > 0)
            {
            	appLogger.error("ManifestFileValidator.validate, validation failed on item \"instances\" in manifest file");
                throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
           	}
        }
    }
    
    appLogger.info("ManifestFileValidator.validate.exit");
  }

  /**
   * Validate resource and scale only
   */
  this.validateResourceScale = function()
  {
    appLogger.info("ManifestFileValidator.validateResourceScale.enter");
    
    var resourceSetArray = [];
    var scaleSetArray = [];

    var finalResourceSet = [];
    var finalScaleSet = []; 

    var resourceScaleData = {resourceData:null, scaleData:null};

    var containers = this.manifestData.manifest.app.containers;
    if (!containers)
    {
    	appLogger.error("ManifestFileValidator.validate, missing required item \"containers\" in manifest file");
        throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
   	}
    for (var i = 0; i < containers.length; i ++)
    {
      var resourceSet = [];
      var scaleSet = [];
      var resources = containers[i].resources;
      
      if (resources)
      {
        for (var j = 0; j < resources.length; j ++)
        {
          if (resourceSet.indexOf(resources[j].level) == -1)
          {
            resourceSet.push(resources[j].level);
          }
        }
        finalResourceSet = resourceSet;
      }
      resourceSetArray.push(resourceSet);

      var scales = containers[i].scale;
      if (scales)
      {
        for (var j = 0; j < scales.length; j ++)
        {
          if (scaleSet.indexOf(scales[j].level) == -1)
          {
            scaleSet.push(scales[j].level);
          }
        }
        finalScaleSet = scaleSet;
      }
      scaleSetArray.push(scaleSet);
    }

    try
    {
      for (var i = 0; i < resourceSetArray.length; i ++)
      {
        if (resourceSetArray[i].length != finalResourceSet.length)
        {
          appLogger.error("ManifestFileValidator.validateResourceScale, invalid resource configuration in manifest file");
          throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
        }
    
        var resourceSet = resourceSetArray[i];
        for (var j = 0; j < resourceSet.length; j ++)
        {
          if (finalResourceSet.indexOf(resourceSet[j]) == -1)
          {
            appLogger.error("ManifestFileValidator.validateResourceScale, invalid resource configuration in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
          }
        }
      }

      for (var i = 0; i < scaleSetArray.length; i ++)
      {
        if (scaleSetArray[i].length != finalScaleSet.length)
        {
          appLogger.error("ManifestFileValidator.validateResourceScale, invalid scale configuration in manifest file");
          throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
        }
    
        var scaleSet = scaleSetArray[i];
        for (var j = 0; j < scaleSet.length; j ++)
        {
          if (finalScaleSet.indexOf(scaleSet[j]) == -1)
          {
            appLogger.error("ManifestFileValidator.validateResourceScale, invalid scale configuration in manifest file");
            throw GlobalsConsts.RESULT_MANIFEST_CONFIG_ERROR;
          }
        }
      }

      resourceScaleData.resourceData = finalResourceSet;
      resourceScaleData.scaleData = finalScaleSet;

      return resourceScaleData;
    }
    finally
    {
      appLogger.info("ManifestFileValidator.validateResourceScale.exit");
    }
  } 
}
