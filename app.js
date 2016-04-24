/* Main application entry point.
 * Run with:
 * $ node app.js
 *
 * Configuration should be in a file named options.well.js in this
 * folder. Create options.example.js to create this file. It is loaded
 * as a node.js module, so you can use JavaScript inside it.
 *
 * The --env command line argument can be used to start the app in a 
 * development mode for debugging:
 * $ node app.js --env=development
 * 
 * The NODE_ENV environment variable can also be used for this purpose
 * $ NODE_ENV=development node app.js
 */

/* This file is PUBLIC DOMAIN. You are free to cut-and-paste to start your own projects, of any kind */
"use strict"

var _  = require('lodash')
var fs = require('fs')

// always capture, log and exit on uncaught exceptions
// your production system should auto-restart the app
// this is the Node.js way
process.on('uncaughtException', function(err) {
  console.error('uncaughtException:', err.message)
  console.error(err.stack)
  process.exit(1)
})

process.on('SIGINT', function(err) {
  process.exit(0)
})


// the easiest way to parse command line arguments
// see https://github.com/substack/node-optimist
var argv = require('optimist').argv

// get deployment type (set to 'development' for development)
// use environment variable NODE_ENV, or command line argument --env
var env = argv.env || process.env['NODE_ENV']

// load the seneca module and create a new instance
// note that module returns a function that constructs seneca instances (just like express)
// so you if you call it right away (as here, with the final () ), you get a default instance
var seneca  = require('seneca')({default_plugins:{'mem-store':false}})

// register the seneca builtin options plugin, and load the options from a local file
// you'll normally do this first -
// each seneca plugin can be given options when you register it ("seneca.use"),
// so you don't have to do this, but it does make life easier
// see the options.well.js file for more
var db = argv.db ? argv.db : process.env.db
load_options(seneca)

// db is set in run arguments (e.g. node app.js --env=development --db=mongo-store)
// for more seneca db stores visit
// https://github.com/search?q=seneca+store
// argv determines locally and process.env determines in docker
// example docker run:
// docker run -v /home/deploy/test:/test -p 3333:3333 --rm -e db=mem-store well-app

// for dbs using seneca-transport
var networkless_dbs = ['mem-store', 'jsonfile-store', 'level-store']
if (!db) db = 'mem-store'

console.log('\nusing ' + db + ' db')
if (networkless_dbs.indexOf(db) === -1) {
  // init plugin for chosen dbs
  seneca.use(db)
  seneca.ready(ready);

} else {
  var sl = require('seneca-store-listen')()

  sl.host(db, function(server_config){
    setTimeout(function(){
      seneca = seneca.client(server_config)
      load_options(seneca)
      ready()
    }, 2000)
  })
}

// loads options as explained above
function load_options(seneca){
  var optionsfolder = 'production' == env ? '/home/deploy/' : './'
  var options_file = optionsfolder+'options.well.js'
  try {
    fs.statSync( options_file )
  }
  catch(e) {
    process.exit( !console.error( "Please copy options.example.js to "+ options_file+': '+e ))
  }
  seneca.use('options',options_file)
}

// used to clear the db
function erase(entity, callback){
  seneca.act({role:'entity', cmd:'remove', qent:seneca.make(entity), q:{all$ : true}}, function(err, data){
    if (err) seneca.error(err)
      callback(err)
  })
}

function ready(){

  // allow to erase DB if --clear=true:
  var clear = argv.clear ? argv.clear : process.env.clear

  if (clear === 'true')
  erase('sys/user', function() {
    erase('team', function() {
      erase('event', function() {
        console.log('db is clean now')
        argv.clear = false
        process.env.clear = false
        ready()
      })
    })
  })
  else {

    seneca.ready(function(){

      // register the seneca-user plugin - this provides user account business logic
      seneca.use('user')

      // register the seneca-auth plugin - this provides authentication business logic
      seneca.use('auth')

      // register the seneca-perm plugin - this provides permission checking
      // set the entity option to true, which means, "check all entities"
      seneca.use('perm',{entity:true})

      seneca.use('well',{fake:'development'==env})
      console.log('db is rebuilt now')

      require('dns').lookup(require('os').hostname(), function (err, addr, fam) {
        console.log('server address: ' + addr + ':' + (process.env['PORT'] || 3333) + '\n');
      })

      // register the seneca-data-editor plugin - this provides a user interface for data admin
      // Open the /data-editor url path to edit data! (you must be an admin, or on localhost)
      seneca.use('data-editor')
      // register your own plugin - the well app business logic!
      // in the options, indicate if you're in development mode
      // set the fake option, which triggers creation of test users and events if env == 'development'
      seneca.use('well',{fake:'development'==env})

      // seneca plugins can export objects for external use
      // you can access these using the seneca.export method

      // get the configuration options
      var options = seneca.export('options')

      // get the middleware function from the builtin web plugin
      var web = seneca.export('web')

      // get the simple database-backed session store defined in well.js
      var sessionstore = seneca.export('well/session-store')

      // load the express module
      // this provides the basic web server
      var express = require('express')
      var session = require('express-session')

      // create an express app
      var app = express()

      // Log requests to console
      app.use( function(req,res,next){
        console.log('EXPRESS',new Date().toISOString(), req.method, req.url)
        next()
      })

      // setup express
      //app.use( require('cookie-parser') )
      app.use( require('body-parser').json() )

      // you can't use a single node in-memory session store if you want to scale
      // well.js defines a session store that uses seneca entities
      app.use( session({ secret: 'CHANGE-THIS', store: sessionstore(session) }) )

      // add in the seneca middleware
      // this is how seneca integrates with express (or any connect-style web server module)
      app.use( web )

      // serve static files from a folder defined in your options file
      app.use( express.static(__dirname+options.main.public) )

      // start listening for HTTP requests
      app.listen( options.main.port )

      seneca.log.info('listen',options.main.port)
    })

  }
}