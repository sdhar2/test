#!/bin/bash
set -e
NAMED_USER=named
BIND_USER=named
DNS_ZONE=${DNS_ZONE:-internal.acp.arris.com}
BIND_PASSWORD=${BIND_PASSWORD:-password}
WEBMIN_ENABLED=${WEBMIN_ENABLED:-true}

copy_bind_configs() {
  #\cp /tmp/etc/named.conf /etc/named.conf
  \cp /tmp/etc/rndc.conf /etc/rndc.conf

  sourcefile=/tmp/etc/ACP_named.conf
  destfile=/etc/named.conf
  sed -e "s/DNS_ZONE/${DNS_ZONE}/g" ${sourcefile} > ${destfile}

  #sourcefile=/tmp/var/named/DNS_ZONE.hosts
  #destfile=/var/named/${DNS_ZONE}.hosts
  #sed -e "s/DNS_ZONE/${DNS_ZONE}/g" ${sourcefile} > ${destfile}

  # set the zone name into the file
  sourcefile=/tmp/var/named/DNS_ZONE.hosts.tmpl
  destfile=/var/named/${DNS_ZONE}.hosts
  sed -e "s/DNS_ZONE/${DNS_ZONE}/g" ${sourcefile} > ${destfile}
 

  ls /data/var/named

  # format the vips with "IN A"
  #acp_vip_file=/data/var/named/acp_vip_definitions
  acp_vip_file=/data/var/named/acp_vip_definitions
  # temp file for formatting user edited vips file
  tempfile=/tmp/vip_names.tmp


  IFS="
  "
  
  count=1
  
  # add "IN 	A" to the VIPS in the template to create the formatted entries in the zone file
  while read -r i || [[ -n "$i" ]]
  do
      # add value only if not empty
      # handle blank lines at end of file
      if [ ${#i} -gt 0 ] ; then
         modline=`echo $i | awk {'printf ("%s\tIN\tA\t%s\n", $1, $2)'}`
         echo $modline
      fi
      (( count++ ))
  done < ${acp_vip_file} > ${tempfile}
  
  unset IFS
  
  # append formatted vip file to zone-names template to create final zone-names file
  cat ${tempfile} >> ${destfile}
  rm ${tempfile}

}

create_pid_dir() {
  if [ ! -d /var/run/named ] ; then
     mkdir -m 0775 -p /var/run/named
  fi
  #chown root:${BIND_USER} /var/run/named
}

remove_default_zones() {
  for f in named.localhost named.loopback named.empty ; do
     if [ -f /var/named/$f ] ; then
        rm /var/named/$f
     fi
  done

}
copy_webmin_configs() {
  # use \ to unalias copy command to prevent possible confirmation
  \cp /tmp/etc/webmin/bind8/config /etc/webmin/bind8/config

  sourcefile=/tmp/etc/webmin/bind8/ACP_zone-names
  destfile=/etc/webmin/bind8/zone-names
  sed -e "s/DNS_ZONE/${DNS_ZONE}/g" ${sourcefile} > ${destfile}

  epochVal=`grep "file_/etc/named.conf=" /etc/webmin/bind8/zone-names  | cut -d= -f2`
  touch --date=@${epochVal} /etc/named.conf
}


set_root_passwd() {
  echo "root:$BIND_PASSWORD" | chpasswd
}

update_resolv_conf() {
  # set the DNS zone to selected zone, and IP to container IP

DNS_IP=`hostname -i`

  #sourcefile=/tmp/etc/resolv.conf.tmpl
  #destfile=/etc/resolv.conf
  #sed -e "s/DNS_ZONE/${DNS_ZONE}/g" -e "s/DNS_IP/${DNS_IP}/g" ${sourcefile} > ${destfile}
#	
cat << EOF_DNS > /etc/resolv.conf
# ACP
# Generated by NetworkManager
search ${DNS_ZONE}
nameserver ${DNS_IP}
nameserver 8.8.8.8
EOF_DNS
}

chmod 644 /etc/resolv.conf

#
# MAIN starts here
#
# copy the pre-configured config files

# If /var/named/named.localhost exists, this is the initial install
# copy the pre-configured config files and remove default zones
#
#
#   TEMPORARY WHILE TESTING
#   FORCE EXISTENCE OF /var/named/named.localhost 
#   TO hit this path

#touch /var/named/named.localhost

  if [ -f /var/named/named.localhost ] ; then
     copy_bind_configs
     copy_webmin_configs
     remove_default_zones
     update_resolv_conf
     #create_pid_dir
  fi


# allow arguments to be passed to named
  if [[ ${1:0:1} = '-' ]]; then
    EXTRA_ARGS="$@"
    set --
  elif [[ ${1} == named || ${1} == $(which named) ]]; then
    EXTRA_ARGS="${@:2}"
    set --
  fi

# default behaviour is to launch named
  if [[ -z ${1} ]]; then
    if [ "${WEBMIN_ENABLED}" == "true" ]; then
      set_root_passwd
      echo "Starting webmin..."
      /etc/init.d/webmin start
    fi

    echo "Starting named..."
    exec $(which named) -u ${NAMED_USER} -g ${EXTRA_ARGS}
  else
    exec "$@"
  fi
