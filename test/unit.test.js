"use strict";
process.setMaxListeners(0)

var Helper = require('./unit.test.helper.js')
var helper = new Helper()
var _      = require('lodash')
var assert = require('assert')
var async  = require('async')
var util   = require('util')
var rimraf = require('rimraf')
var self   = this;
var seneca;

// each series of operations has its own scope for convenience 
var local = {}

function after(cb, field, err, res){
  // err checking
  if (err) return self.seneca.fail(err)
  // expose res as field
  if (field) local[field] = res
  return cb(err, res)
}

describe('setup', function() {
  this.timeout(3000)
  it('init', function(done) {
    helper.init(done, true, function(seneca) {
      assert.ok(seneca, 'init not ok');
      done()
    })
  })
})

describe('happy', function() {
  it('happy main', function(done) {
    helper.init(done, false, function(seneca) {
      self.seneca = seneca;

      local = {}
      async.series([
          function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))}, // load event A from db
          function(cb){ helper.entities.user.list$({}, after.bind(null, cb, 'users'))},             // load users from db
          // insert all users into event A, team Red
          function(cb) {
            seneca.util.recurse(local.users.length, function( index, next ){
              seneca.act('role:well, cmd:joinevent', {
                user: local.users[index],
                event: local.event,
                tnum:0
              }, next)
            }, cb)
          },
          function(cb){ helper.entities.team.load$({ event: local.event.id, num: 0 }, after.bind(null, cb, 'team'))}, // load team Red from event A
          // change team users' into array
          function(cb) {
            var members = []
              _.each(local.team.users, function(user) {
                members.push(user)
            })
            local.team.users = members
            cb()
          },
          function(cb){ helper.entities.user.load$({ name: local.team.users[0].name }, after.bind(null, cb, 'member_zero'))}, // Load member 0
          function(cb){ helper.entities.user.load$({ name: local.team.users[1].name }, after.bind(null, cb, 'member_one'))},  // Load member 1
          // Exchange members' cards
          function(cb){ seneca.act({
            role: 'well',
            cmd: 'well',
            user: local.member_zero,
            event: local.event,
            other: local.member_one.nick,
            card: local.event.users[local.member_one.nick].c
          }, after.bind(null, cb, 'wellres'))
        },
        function(cb){ assert.equal(local.wellres.team.numwells, 1); cb() }, // check if the points were added
      ], done)
    })
  })
})

describe('data structure integrity', function() {
  it('cmd:whoami logged out', function(done) {
    helper.init(done, false, function(seneca){
      self.seneca = seneca;

      local = {}
      async.series([
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))},                          // load event A from db
        function(cb){ seneca.act({ role: 'well', cmd: 'whoami', event: local.event }, after.bind(null, cb, 'whoami'))}, // call whoami for this event
        function(cb){ assert.equal(local.whoami.event.name, local.event.name); cb() }                                // should return contents of event A
      ], done)
    })
  })

  // currently does not check for the avatar
  it ('cmd:whoami logged in', function(done){
    helper.init(done, false, function(seneca){
      self.seneca = seneca;

      local = {}
      async.series([
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))}, // load event A from db
        function(cb){ helper.entities.user.load$({ nick:'admin' }, after.bind(null, cb, 'user'))},  // load admin from db
        // call whoami for this user and event
        function(cb){ seneca.act({ role: 'well', cmd: 'whoami', event: local.event, user: local.user }, after.bind(null, cb, 'whoami'))},
        // should return meta data object: {card:,avatar:,user:,team:,event:}
        function(cb){
          assert.equal(local.whoami.card, local.user.events[local.event.id].c)
          assert.equal((local.user.avatar === undefined && local.whoami.avatar === false), true)
          assert.equal(local.whoami.user.id, local.user.id)
          assert.equal(local.whoami.team.num, local.user.events[local.event.id].t)
          assert.equal(local.whoami.event.id, local.event.id)
          cb()
        }
      ], done)
    })
  })

  it('cmd:leader', function(done){
    helper.init(done, false, function(seneca){
      self.seneca = seneca;

      local = {}
      async.series([
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))}, // load event A from db
        // get list of teams in event A through cmd:leader
        function(cb){ seneca.act({ role: 'well', cmd: 'leader', event: local.event }, after.bind(null, cb, 'leader'))},
        // get list of teams in event A directly from db
        function(cb){ helper.entities.team.list$({ event: local.event.id }, after.bind(null, cb, 'dbteams'))},
        // compare
        function(cb){
          // format both lists into arrays of names(leader does not contain id data)
          local.dbteams = local.dbteams.map(function(element) {
            return element.name
          })
          local.leader = local.leader.teams.map(function(element) {
            return element.name
          })
          // compare team names
          assert.deepEqual(local.dbteams, local.leader)
          // make sure an unwanted element is not contained within the cmd:leader response
          assert.equal(local.leader.indexOf('Blue'), -1)
          cb()
        }
      ], done)
    })
  })

  it ('cmd:members', function(done){
    this.timeout(3500)
    helper.init(done, false, function(seneca){
      self.seneca = seneca;

      local = {}
      async.series([
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))}, // load event A from db
        function(cb){ helper.entities.user.list$({}, after.bind(null, cb, 'users'))},             // load users from db
        // insert all users into event A
        function(cb){
          seneca.util.recurse(local.users.length, function( index, next ){
            seneca.act('role:well, cmd:joinevent', {
              user: local.users[index],
              event: local.event,
            }, next)
          }, cb)
        },
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))},   // load event A from db to refresh data
        // load the only team in event A from db
        function(cb){ helper.entities.team.load$({ event: local.event.id, num: 0 }, after.bind(null, cb, 'team'))},
        function(cb){ helper.entities.user.load$({ nick:'admin' }, after.bind(null, cb, 'admin'))}, // load a known user from that team
        // obtain members
        function(cb){ seneca.act({ role: 'well', cmd: 'members', team: local.team, user: local.admin }, after.bind(null, cb, 'members'))},
        // compare db against members return data
        function(cb){
          // store db members in an array and
          // remove admin from list which is db clone.
          // admin is being removed, because it's supplied
          // into members call as the user to be ignored
          var dbnames = []
          _.each(local.team.users, function(teamuser) {
            if (teamuser.name != 'admin') dbnames.push(teamuser.name)
          })
          // storing returned members in an array
          var memnames = []
          _.each(local.members.members, function(member) {
            memnames.push(member.name)
          })
          // make sure does not contain admin
          assert.equal((dbnames.indexOf('admin') === -1), true)
          assert.equal((memnames.indexOf('admin') === -1), true)
          // make sure db elements are same as returned elements
          assert.deepEqual(dbnames, memnames)
          cb()
        }
      ], done)
    })
  })

  it ('cmd:member', function(done){
    helper.init(done, false, function(seneca){
      self.seneca = seneca;

      local = {}
      async.series([
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))}, // load event A from db
        function(cb){ helper.entities.user.load$({nick:'admin'}, after.bind(null, cb, 'admin'))}, // load admin from db
        // insert admin to event A
        function(cb){ seneca.act({ role: 'well', cmd: 'joinevent', user: local.admin, event: local.event }, after.bind(null, cb, 'joinres'))},
        // call member for user admin in this event
        function(cb){ seneca.act({ role: 'well', cmd: 'member', other: local.admin.nick, event: local.event }, after.bind(null, cb, 'member'))},
        // should return meta data object: {nick:,name:,avatar}
        function(cb){
            assert.equal(local.member.nick, local.admin.nick)
            assert.equal(local.member.name, local.admin.name)
            assert.equal((local.member.avatar === false && local.admin.avatar === undefined), true)
          cb()
        }
      ], done)
    })
  })

  it ('cmd:createevent', function(done){
    helper.init(done, false, function(seneca){
      self.seneca = seneca;

      // Create the event
      seneca.act('role:well, cmd:createevent', {
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
    helper.init(done, false, function(seneca) {
      self.seneca = seneca;

      local = {}
      async.series([
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))}, // load event A from db
        function(cb){ helper.entities.user.load$({nick:'admin'}, after.bind(null, cb, 'admin'))}, // load admin from db
        // insert admin to event A
        function(cb){ seneca.act({ role: 'well', cmd: 'joinevent', user: local.admin, event: local.event, tnum: 0 }, after.bind(null, cb, 'joinres'))},
        // should return meta data object: {card:, user:, team:, event:}
        function(cb){
          assert.equal((local.joinres.card >= 0 && local.joinres.card < local.event.numcards), true)
          assert.equal(local.joinres.user.nick, 'admin')
          assert.equal(local.joinres.team.name, 'Red')
          assert.equal(local.joinres.event.code, 'ma')
          cb()
        }
      ], done)
    })
  })

})

describe('scenarios', function() {
  it('two teams play the game as intended', function(done) {
    helper.init(done, false, function(seneca){
      self.seneca = seneca;
      
      local = {}
      async.series([
        function(cb){ helper.entities.event.load$({ code:'ma' }, after.bind(null, cb, 'event'))}, // load event A from db
        function(cb){ helper.entities.user.list$({}, after.bind(null, cb, 'users'))},             // load users from db
        // insert all users into event A
        function(cb){

          local.team_r = []
          local.team_g = []

          async.map(local.users, function(user, mapcb){
            // ensure at least 3 users in team Red
            // all others go to team Green
            var tnum = 0
            if (local.users.indexOf(user) > 2) tnum = 1

            seneca.act('role:well, cmd:joinevent', {
              user: user,
              event: local.event,
              tnum: tnum
            }, function(err, res) {
              // populate temp arrays while populating the event
              if (user.events[local.event.id].t === 0) local.team_r.push(user)
              else if (user.events[local.event.id].t === 1) local.team_g.push(user)
              return mapcb()
            })
          }, cb)
        },
        // exchange some red cards
        function(cb){ seneca.act({ role: 'well', cmd: 'well',
          user: local.team_r[0], event: local.event, other: local.team_r[1].nick,
          card: local.event.users[local.team_r[1].nick].c }, after.bind(null, cb, null))},
        function(cb){ seneca.act({ role: 'well', cmd: 'well',
          user: local.team_r[1], event: local.event, other: local.team_r[2].nick,
          card: local.event.users[local.team_r[2].nick].c }, after.bind(null, cb, null))},
        function(cb){ seneca.act({ role: 'well', cmd: 'well',
          user: local.team_r[2], event: local.event, other: local.team_r[0].nick,
          card: local.event.users[local.team_r[0].nick].c }, after.bind(null, cb, null))},
        function(cb){ seneca.act({ role: 'well', cmd: 'well',
          user: local.team_r[2], event: local.event, other: local.team_r[0].nick,
          card: local.event.users[local.team_r[0].nick].c }, after.bind(null, cb, 'redwells'))},
        // check if the points were added
        function(cb){
          assert.equal(local.redwells.team.numwells, 4)
          cb()
        },
        // exchange some green cards
        function(cb){ seneca.act({ role: 'well', cmd: 'well',
          user: local.team_g[0], event: local.event, other: local.team_g[1].nick,
          card: local.event.users[local.team_g[1].nick].c }, after.bind(null, cb, null))},
        function(cb){ seneca.act({ role: 'well', cmd: 'well',
          user: local.team_g[1], event: local.event, other: local.team_g[2].nick,
          card: local.event.users[local.team_g[2].nick].c }, after.bind(null, cb, null))},
        function(cb){ seneca.act({ role: 'well', cmd: 'well',
          user: local.team_g[2], event: local.event, other: local.team_g[0].nick,
          card: local.event.users[local.team_g[0].nick].c }, after.bind(null, cb, 'greenwells'))},
        // check if the points were added
        function(cb){
          assert.equal(local.greenwells.team.numwells, 3)
          cb()
        }
      ], done)
    })
  })
})

describe('clean-up', function() {
  it('clean db', function(done){
    helper.clean_db(function(err){
      rimraf(__dirname + '/unit-db/', function() {
          done()
      })
    })
  })
})