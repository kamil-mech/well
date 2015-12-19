"use strict";

module.exports =
  function() {

    var db = process.env['npm_config_db']
    var _  = require('lodash')
    var fs = require('fs')
    var util = require('util')
    var async = require('async')
    
    var seneca
    var blank = true

    var self = this

    this.init_empty = function(errhandler, nuke, done) {
        var si = require('seneca')({
        strict: { result: false },
        errhandler: errhandler,
        default_plugins:{'mem-store':false}
      })
      seneca = si

      // get options
      seneca.use('options', '../options.well.js')
      var options = seneca.export('options')
      options.dev_setup = options.well.dev_setup // <- this is not normal, check if app should really work like this

      // init and clean db
      if (!db){
        throw new Error('No db specified. try npm test --db=mem-store or any other store')
        process.exit(0)
      }
      console.log('using ' + db + ' db')

      var db_path = __dirname + '/unit-db/'

      // ensure db folder
      if (!fs.existsSync(db_path)) fs.mkdirSync(db_path)

      var base_path = db_path
      // setup db-specific args
      var db_args = {}
      if (db === 'jsonfile-store' || db === 'level-store') {
        var id = 0;
        while (fs.existsSync(db_path)) {
          id++
          db_path = base_path + db + '-' + id
          db_args = {folder:db_path}
        }
      } else db_path += db

      // ensure db subfolder
      if (!fs.existsSync(db_path)) fs.mkdirSync(db_path)

      if (options[db] && options[db].host && options[db].port) console.log('connecting at ' + options[db].host + ':' + options[db].port)
        else console.log('db connection is internal')
      seneca.use(db, db_args)
      seneca.ready(function(){

        self.clean_db(function(err){
          
          // init well.js
          seneca.use('user')
          seneca.use('../well', options)

          seneca.ready(function(){
            done()
          })
        })
      })
    }

    this.init = function(errhandler, nuke, done) {
      if (nuke) {
        this.init_empty(errhandler, nuke, function(){
          fin()
        })
      } else {
        fin()
      }

      function fin(){

        self.entities = {
          event: seneca.make$('event'),
          team: seneca.make$('team'),
          user: seneca.make$('sys/user')
        }

        if (blank) from_scratch()
        else {
          self.raw_data(function(){
            done(seneca)
          })
        }

        function from_scratch(){
          blank = false

          var event_a = {}
          var event_b = {}

          // unfortunately seneca stores really don't like parallel
          // add events
          async.series([
            function(cb) {
              seneca.make$('event').save$({ // cannot use self.entities.event as save$ is special
                numcards: 52,
                numteams: 2,
                name: 'MeetupA',
                code: 'ma',
                users: {}
              }, function(err, res){
                event_a = res
                cb()
              })
            },
            function(cb) {
              seneca.make$('event').save$({
                numcards: 52,
                numteams: 1,
                name: 'MeetupB',
                code: 'mb',
                users: {}
              }, function(err, res){
                event_b = res
                cb()
              })
            },
            // add teams
            function(cb) {
              seneca.make$('team').save$({
                num: 0,
                event: event_a.id,
                eventcode: event_a.code,
                name: 'Red',
                wells: {},
                numwells: 0,
                users: {}
              }, cb)
            },
            function(cb) {
              seneca.make$('team').save$({
                num: 1,
                event: event_a.id,
                eventcode: event_a.code,
                name: 'Green',
                wells: {},
                numwells: 0,
                users: {}
              }, cb)
            },
            function(cb) {
              seneca.make$('team').save$({
                num: 0,
                event: event_b.id,
                eventcode: event_b.code,
                name: 'Blue',
                wells: {},
                numwells: 0,
                users: {}
              }, cb)
            }
          ], function(err, res){
         
         // add users
          async.map([0, 1, 2, 3, 4, 5, 6], function(index, next){
            seneca.act('role:user,cmd:register', {
              nick: 'u' + index,
              name: 'n' + index,
              password: 'p' + index
            }, next)
          }, function(err, data){

              done(seneca)     
          }) })
        }
      }
    }

    this.raw_data = function(cb){
      async.parallel([
        raw.bind(null, 'event'),
        raw.bind(null, 'team'),
        raw.bind(null, 'sys/user')
      ], cb)

      function raw(entity, lcb){
        var ent = seneca.make$(entity)
        ent.list$(function(err, res){
          async.mapSeries(res, function(entry, next){
            if (entry.users) entry.users = {}
            if (entry.events) entry.events = {}
            if (entry.numwells) entry.numwells = 0
            ent.save$(entry, next)
          }, lcb)
        })
      }
    }

    // erases all entities from db
    this.clean_db = function(cb){
      console.log('ERASING ALL')
      async.parallel([
        erase.bind(null, 'sys/user'),
        erase.bind(null, 'team'),
        erase.bind(null, 'event'),
      ], cb)
    }

    // erase particular entity from db
    function erase(entity, cb){
      seneca.act({ role:'entity', cmd:'remove', qent: seneca.make$(entity), q: { all$ : true } }, cb)
    }

    this.list_all = function(cb){
      console.log('LOADING ALL ENTITIES')
      self.entities.event.list$(function (err, ev){
        self.entities.team.list$(function (err, te){
          self.entities.user.list$(function (err, us){
            var all = {
              event: ev,
              team: te,
              user: us
            }

            console.log('ALL ENTITIES: ' + util.inspect(all))
            cb()
          })
        })
      })
    }

  }