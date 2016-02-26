CDC_PASSWORD=`openssl rsautl -inkey /opt/keys/key.txt -decrypt < /opt/keys/output.bin | cut -d " " -f1`
USER_URL='https://acpapi:9100/dbaas/v1.0/postgresql/apps/cdc/users/cdc?pw='${CDC_PASSWORD}
echo 'Ensure user is created...'
curl --url ${USER_URL} -X PUT -k --write-out %{http_code}
echo ''
sleep 5
DB_URL='https://acpapi:9100/dbaas/v1.0/postgresql/apps/cdc/databases/cdc?user=cdc&pw='${CDC_PASSWORD}
echo 'Ensure DB is created...' 
curl --url ${DB_URL} -X PUT -k 
echo ''
