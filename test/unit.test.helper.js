"use strict";

module.exports =
  function() {

    var db = process.env['npm_config_db']
    var ip = process.env['npm_config_ip']
    var port = process.env['npm_config_port']
    var _  = require('lodash')
    var fs = require('fs')
    var util = require('util')
    var async = require('async')

    var dbsc; // db shallow copy
    var self = this

    this.init_empty = function(errhandler, done) {
      var seneca = require('seneca')({
        errhandler: errhandler,
        default_plugins:{'mem-store':false}
      })

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
        while (fs.existsSync(db_path)) {
          id = (Math.random() * 1000).toString().substring(0, 3)
          db_path = base_path + db + '-' + id
          db_args = {folder:db_path}
        }
      } else db_path += db

      // ensure db subfolder
      if (!fs.existsSync(db_path)) fs.mkdirSync(db_path)


      if (ip && ip !== '' && port && port !== '') {
        db_args.host = ip
        db_args.port = port
      }
      if (db_args.host && db_args.port) console.log('connecting at ' + db_args.host + ':' + db_args.port)
        else console.log('db connection is internal')
      seneca.use(db, db_args)

      this.clean_db(seneca, function(err){

          // init well.js
          seneca.use('user')
          seneca.use('../well', options)

          done(seneca)
      })
    }

    this.init = function(errhandler, done) {
      this.init_empty(errhandler, function(seneca){

        self.entities = {
          event: seneca.make$('event'),
          team: seneca.make$('team'),
          user: seneca.make$('sys/user')
        }

        if (_.isEmpty(dbsc)) from_scratch()
        else {
          self.from_dbsc(seneca, function(){
            done(seneca)
          })
        }

        function from_scratch(){
          var event_a = {}
          var event_b = {}

          // unfortunately seneca stores really don't like parallel
          // add events
          async.series([
            function(cb) {
              self.entities.event.save$({
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
              self.entities.event.save$({
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
              self.entities.team.save$({
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
              self.entities.team.save$({
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
              self.entities.team.save$({
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

              self.to_dbsc(seneca, function(){
                done(seneca)
          }) }) })
        }
      })
    }

    this.to_dbsc = function(seneca, cb){
      dbsc = {}
      async.parallel([
        sample.bind(null, 'event'),
        sample.bind(null, 'team'),
        sample.bind(null, 'sys/user')
      ], cb)

      function sample(entity, scb){
        seneca.make$(entity).list$({}, function(err, res){
          dbsc[entity] = _.clone(res)
          scb()
        })
      }
    }

    this.from_dbsc = function(seneca, cb){
      async.parallel([
        load.bind(null, 'event'),
        load.bind(null, 'team'),
        load.bind(null, 'sys/user')
      ], cb)

      function load(entity, lcb){
        var ent = seneca.make$(entity)
        async.mapSeries(dbsc[entity], function(entry, next){
          if(entry.users) entry.users = {}
          if(entry.events) entry.events = {}
          ent.save$(entry, next)
        }, lcb)
      }
    }

    // erases all entities from db
    this.clean_db = function(seneca, cb){
      async.parallel([
        erase.bind(null, 'sys/user', seneca),
        erase.bind(null, 'team', seneca),
        erase.bind(null, 'event', seneca),
      ], cb)
    }

    // erase particular entity from db
    function erase(entity, seneca, cb){
      seneca.act({role:'entity', cmd:'remove', qent:seneca.make$(entity), q:{all$ : true}}, cb)
    }

  }