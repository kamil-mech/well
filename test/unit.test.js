// ADD COPYRIGHT INFO OR A DISCLAIMER
"use strict"
process.setMaxListeners(0)

var Helper = require('./unit.test.helper.js')
var helper = new Helper();
var _      = require('lodash')
var assert = require('assert')
var async = require('async')
var util = require('util')

var scontext = {};

function after(cb, field, err, res){
  // err checking
  if (err) return seneca.fail(err)
  // expose res as field
  if (field) scontext[field] = res;
  return cb(err, res)
}

describe('happy', function() {
  this.timeout(15000)

  it('happy main', function(done) {
    helper.init(done, function(seneca) {

      scontext = {}
      async.series([
          function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))}, // load event A from db
          function(cb){ helper.entities.user.list$({}, after.bind(null, cb, 'users'))},             // load users from db
          // insert all users into event A, team Red
          function(cb) {
            seneca.util.recurse(scontext.users.length, function( index, next ){
              seneca.act('role:well, cmd:joinevent', {
                user: scontext.users[index],
                event: scontext.event,
                tnum:0
              }, next)
            }, cb)
          },
          function(cb){ helper.entities.team.load$({ event: scontext.event.id, num: 0 }, after.bind(null, cb, 'team'))}, // load team Red from event A          function(cb){
          // change team users' into array
          function(cb) {
            var members = []
              _.each(scontext.team.users, function(user) {
                members.push(user)
            })
            scontext.team.users = members
            cb()
          },
          function(cb){ helper.entities.user.load$({ name: scontext.team.users[0].name }, after.bind(null, cb, 'member_zero'))}, // Load member 0
          function(cb){ helper.entities.user.load$({ name: scontext.team.users[1].name }, after.bind(null, cb, 'member_one'))},  // Load member 1
          // Exchange members' cards
          function(cb){ seneca.act({
            role: 'well',
            cmd: 'well',
            user: scontext.member_zero,
            event: scontext.event,
            other: scontext.member_one.nick,
            card: scontext.event.users[scontext.member_one.nick].c
          }, after.bind(null, cb, 'wellres'))
        },
        function(cb){ assert.equal(scontext.wellres.team.numwells, 1); cb() }, // check if the points were added
      ], done);
    })
  })
})

describe('data structure integrity', function() {
  this.timeout(15000)

  it('cmd:whoami logged out', function(done) {
    helper.init(done, function(seneca){

      scontext = {}
      async.series([
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))},                          // load event A from db
        function(cb){ seneca.act({ role: 'well', cmd: 'whoami', event: scontext.event }, after.bind(null, cb, 'whoami'))}, // call whoami for this event
        function(cb){ assert.equal(scontext.whoami.event.name, scontext.event.name); cb() }                                // should return contents of event A
      ], done);
    })
  })

  // Currently does not check for the avatar
  it ('cmd:whoami logged in', function(done){
    helper.init(done, function(seneca){

      // Load event A from DB
      ;seneca
        .make$('event')
        .load$({code:'ma'},function(err,event){
      // Load admin from DB
      ;seneca
        .make('sys/user').load$({nick:'admin'}, function(err, user) {
      // Should return meta data object: {card:,avatar:,user:,team:,event:}
      ;seneca
        .act('role:well, cmd:whoami', {
          user: user,
          event: event
        }, function(err, res) {
          assert.equal(res.card, user.events[event.id].c)
          assert.equal((user.avatar === undefined && res.avatar === false), true)
          assert.equal(res.user.id, user.id)
          assert.equal(res.team.num, user.events[event.id].t)
          assert.equal(res.event.id, event.id)
            
          done()
      }) }) })
    })
  })

  it('cmd:leader', function(done){
    helper.init(done, function(seneca){

      // Load event A from db
      ;seneca
        .make$('event')
        .load$({code:'ma'}, function(err, event){
      // Get list of teams in event A through cmd:leader
      ;seneca
        .act('role:well, cmd:leader', {
          event: event
        }, function(err, leader){
      // Get list of teams in event A directly from db
      ;seneca
        .make$('team')
        .list$({event:event.id}, function(err, dbteams){
            // Format both lists into arrays of names(leader does not contain id data)
            dbteams = dbteams.map(function(element) {
              return element.name
            })
            leader = leader.teams.map(function(element) {
              return element.name
            })
          // Compare team names
          assert.deepEqual(dbteams, leader)
          // Make sure an unwanted element is not contained within the cmd:leader response
          assert.equal(leader.indexOf('Blue'), -1)

          done()
      }) }) })
    })
  })

  it ('cmd:members', function(done){
    this.timeout(15000)
    
    helper.init(done, function(seneca){

      // Load event A from db
      ;seneca
        .make$('event')
        .load$({code:'ma'}, function(err, event){
      // Load users from db
      ;seneca
        .make$('sys/user')
        .list$(function(err, users){
      // Insert all users into event A
      seneca.util.recurse(users.length, function( index, next ){
        seneca
        .act('role:well, cmd:joinevent', {
          user: users[index],
          event: event,
        }, next)
      }, function(err, data){

      // Load event A from db to refresh data
      ;seneca
        .make$('event')
        .load$({code:'ma'}, function(err, event){
      // Load the only team in event A from db
      ;seneca
        .make$('team')
        .load$({event:event.id, num:0}, function(err, team){
      // Load a known user from that team
      ;seneca
        .make$('sys/user')
        .load$({nick:'admin'}, function(err, admin){
      // Obtain members
      ;seneca
        .act('role:well, cmd:members', {
            team: team,
            user: admin
          }, function(err, members) {
        // Compare db against members return data:

        // Store db members in an array and
        // remove admin from list which is db clone.
        // Admin is being removed, because it's supplied
        // into members call as the user to be ignored
        var dbnames = []
        _.each(team.users, function(teamuser) {
          if (teamuser.name != 'admin') dbnames.push(teamuser.name)
        })
        // Storing returned members in an array
        var memnames = []
        _.each(members.members, function(member) {
          memnames.push(member.name)
        })
        // Make sure does not contain admin
        assert.equal((dbnames.indexOf('admin') === -1), true)
        assert.equal((memnames.indexOf('admin') === -1), true)
        // Make sure db elements are same as returned elements
        assert.deepEqual(dbnames, memnames)

        done()
      }) }) }) }) }) }) })
    })
  })

  it ('cmd:member', function(done){
    helper.init(done, function(seneca){

      // Load event A from db
      ;seneca
        .make$('event')
        .load$({code:'ma'}, function(err, event){
      // Load admin from db
      ;seneca
        .make$('sys/user')
        .load$({nick:'admin'}, function(err, admin){
      // Insert admin to event A
      ;seneca
        .act('role:well, cmd:joinevent', {
          user: admin,
          event: event
        }, function(err, res) {
      // Should return meta data object: {nick:,name:,avatar}
      ;seneca
        .act('role:well, cmd:member', {
            other: admin.nick,
            event: event
          }, function(err, res) {
            assert.equal(res.nick, admin.nick)
            assert.equal(res.name, admin.name)
            assert.equal((res.avatar === false && admin.avatar === undefined), true)

            done()
      }) }) }) })
    })
  })

  it ('cmd:createevent', function(done){
    helper.init(done, function(seneca){

      // Create the event
      ;seneca
        .act('role:well, cmd:createevent', {
              numcards: 52,
              numteams: 2,
              name: 'MeetupX',
              code: 'mx'
            }, function(err, event) {
              // Should exist and contain same data as fed into it
              assert.equal(event.numcards, 52)
              assert.equal(event.numteams, 2)
              assert.equal(event.name, 'MeetupX')
              assert.equal(event.code, 'mx')

              done()
      })
    })
  })

  it('cmd:joinevent', function(done) {
    helper.init(done, function(seneca) {
      // Load event A from db
      ;seneca
        .make$('event')
        .load$({code:'ma'}, function(err, event){
      // Load admin from db
      ;seneca
        .make$('sys/user')
        .load$({nick:'admin'}, function(err, admin){
      // Insert admin to event A
      ;seneca
        .act('role:well, cmd:joinevent', {
          user: admin,
          event: event,
          tnum: 0
        }, function(err, res) {
        // Should return meta data object: {card:, user:, team:, event:}
         assert.equal((res.card >= 0 && res.card < event.numcards), true)
         assert.equal(res.user.nick, 'admin')
         assert.equal(res.team.name, 'Red')
         assert.equal(res.event.code, 'ma')
      // Should contain admin
      ;seneca
        .make$('event')
        .load$({code:'ma'}, function(err, event){
          assert.equal(event.users.admin !== undefined, true)

          done()
      }) }) }) })
    })
  })

})

describe('scenarios', function() {
  this.timeout(15000)

  it('two teams play the game as intended', function(done) {
    helper.init(done, function(seneca){
      
      // Load event A from db
      ;seneca
        .make$('event')
        .load$({code:'ma'}, function(err, event){
      // Load users from db
      ;seneca
        .make$('sys/user')
        .list$(function(err, users){

      // Insert users into event A
      var team_r = []
      var team_g = []
      _.each(users, function(user) {

        // Ensure at least 3 users in team Red
        // All others go to team Green
        var tnum = 0
        if (users.indexOf(user) > 2) tnum = 1
      ;seneca
        .act('role:well, cmd:joinevent', {
          user: user,
          event: event,
          tnum:tnum
        }, function(err, res) {
          // Populate temp arrays while populating the event
          // since it's easenecaer and cleaner this way
          if (user.events[event.id].t === 0) team_r.push(user)
          else if (user.events[event.id].t === 1) team_g.push(user)

          if (users.indexOf(user) < users.length - 1) return // <-- Loop control

      // Exchange some cards
      ;seneca
        .act('role:well, cmd:well', {
          user: team_r[0],
          event: event,
          other: team_r[1].nick,
          card: event.users[team_r[1].nick].c
        }, function(err, res){
      ;seneca
        .act('role:well, cmd:well', {
          user: team_r[1],
          event: event,
          other: team_r[2].nick,
          card: event.users[team_r[2].nick].c
        }, function(err, res){
      ;seneca
        .act('role:well, cmd:well', {
          user: team_r[2],
          event: event,
          other: team_r[0].nick,
          card: event.users[team_r[0].nick].c
        }, function(err, res){
      ;seneca
        .act('role:well, cmd:well', {
          user: team_r[2],
          event: event,
          other: team_r[0].nick,
          card: event.users[team_r[0].nick].c
        }, function(err, res){
          // Check if the points were added
          assert.equal(res.team.numwells, 4)
          
      ;seneca
        .act('role:well, cmd:well', {
          user: team_g[0],
          event: event,
          other: team_g[1].nick,
          card: event.users[team_g[1].nick].c
        }, function(err, res){
      ;seneca
        .act('role:well, cmd:well', {
          user: team_g[1],
          event: event,
          other: team_g[2].nick,
          card: event.users[team_g[2].nick].c
        }, function(err, res){
      ;seneca
        .act('role:well, cmd:well', {
          user: team_g[2],
          event: event,
          other: team_g[0].nick,
          card: event.users[team_g[0].nick].c
        }, function(err, res){
          // Check if the points were added
          assert.equal(res.team.numwells, 3)

          done()
      }) }) }) }) }) }) }) }) }) }) })
    })
  })
})

describe('clean-up', function() {
  this.timeout(15000)
  it('clean db', function(done){
    helper.init_empty(done, function(seneca){
      helper.clean_db(seneca, function(err){
        done()
      })
    })
  })
})