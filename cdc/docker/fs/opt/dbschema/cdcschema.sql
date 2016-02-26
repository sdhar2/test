create table application (id serial primary key, appid varchar(50) not null, appversion varchar(50) not null, constraint cdc_app_uk1 UNIQUE(appid, appversion), started varchar(50) not null);

create table applicationinstallstatus (id serial primary key, application_id integer references application (id) on delete cascade, appinstallstatus text, constraint cdc_ais_uk1 UNIQUE(application_id));

create table applicationdeploystatus (id serial primary key, application_id integer references application (id) on delete cascade, appdeploystatus text, constraint cdc_ads_uk1 UNIQUE(application_id));

create table applicationmanifest (id serial primary key, application_id integer references application (id) on delete cascade, manifestdata text, constraint cdc_am_uk1 UNIQUE(application_id));

create table applicationportlist (id serial primary key, application_id integer references application (id) on delete cascade, portlist text, constraint cdc_ap_uk1 UNIQUE(application_id));

create table applicationscaledata (id serial primary key, application_id integer references application (id) on delete cascade, scaledata text, constraint cdc_ascl_uk1 UNIQUE(application_id));

create view applicationview as select a.appid, a.appversion, asti.appinstallstatus, astd.appdeploystatus, am.manifestdata, ap.portlist, ascl.scaledata, a.started from application a, applicationinstallstatus asti, applicationdeploystatus astd, applicationmanifest am, applicationportlist ap, applicationscaledata ascl where a.id=asti.application_id and a.id=astd.application_id and a.id=am.application_id and a.id=ap.application_id and a.id=ascl.application_id;

create or replace function applicationview_dml()
returns trigger
language plpgsql
as $function$
  begin
   if tg_op = 'INSERT' THEN
     insert into application (appid, appversion, started) values(new.appid, new.appversion, new.started);
     insert into applicationinstallstatus (application_id, appinstallstatus) select a.id, new.appinstallstatus from application a where a.appid = new.appid and a.appversion = new.appversion;
     insert into applicationdeploystatus (application_id, appdeploystatus) select a.id, new.appdeploystatus from application a where a.appid = new.appid and a.appversion = new.appversion;
     insert into applicationmanifest (application_id, manifestdata) select a.id, new.manifestdata from application a where a.appid = new.appid and a.appversion = new.appversion;
     insert into applicationportlist (application_id, portlist) select a.id, new.portlist from application a where a.appid = new.appid and a.appversion = new.appversion;
     insert into applicationscaledata (application_id, scaledata) select a.id, new.scaledata from application a where a.appid = new.appid and a.appversion = new.appversion;
     return new;
   elsif tg_op = 'UPDATE' THEN
     update application set started=new.started where appid=new.appid and appversion=new.appversion;
     update applicationinstallstatus set appinstallstatus=new.appinstallstatus from application a where a.appid = new.appid and a.appversion = new.appversion and application_id = a.id;
     update applicationdeploystatus set appdeploystatus=new.appdeploystatus from application a where a.appid = new.appid and a.appversion = new.appversion and application_id = a.id;
     update applicationmanifest set manifestdata=new.manifestdata from application a where a.appid = new.appid and a.appversion = new.appversion and application_id = a.id;
     update applicationportlist set portlist=new.portlist from application a where a.appid = new.appid and a.appversion = new.appversion and application_id = a.id;
     update applicationscaledata set scaledata=new.scaledata from application a where a.appid = new.appid and a.appversion = new.appversion and application_id = a.id;
     return new;
   end if;
   return new;
  end;
$function$;

create trigger applicationview_dml_trig
instead of insert or update on applicationview
for each row execute procedure applicationview_dml();
