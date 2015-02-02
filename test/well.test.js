// TODO:
// - Five more test cases
// - Check dev_setup
// - Can you ever be a member of two teams at the same time?

// ADD COPYRIGHT INFO OR A DISCLAIMER
"use strict";

var Helper   = require('./test-helper.js')
var helper = new Helper();
var _     = require('lodash')
var util   = require('util')
var assert   = require('assert')
var async   = require('async')
var seneca  = helper.seneca

var userent  = helper.userent
var teament  = helper.teament
var eventent  = helper.eventent

describe('seneca, role:well', function(){

  beforeEach(function(done){
    async.waterfall([
      // Adding events
      function(callback){
        eventent.make$(_.extend({
          numcards: 52,
          numteams: 2,
          name:     'MeetupA',
          code:     'ma',
          users:    {}
        },_.omit({name:'MeetupA', code:'ma'},['role','cmd']))).save$( function(err, event){
          callback(err)
        })
      },
      function(callback){
        eventent.make$(_.extend({
          numcards: 52,
          numteams: 1,
          name:     'MeetupB',
          code:     'mb',
          users:    {}
        },_.omit({name:'MeetupB', code:'mb'},['role','cmd']))).save$( function(err, event){
          callback(err)
        })
      },
      // Loading events from db
      function(callback){
        eventent.list$(function(err,events){
          callback(err, events)
        })
      },
      // Adding teams
      // Add a team to event with index 0
      function(events, callback){
        teament.make$({
            num:0, 
            event:events[0].id, 
            eventcode:events[0].code,
            name:'Red',
            wells:{},
            numwells:0,
            users:{}
          }).save$(function(err, entity){
              callback(err, events)
          })
      },
      // Add another team to event with index 0
      function(events, callback){
        teament.make$({
            num:1, 
            event:events[0].id, 
            eventcode:events[0].code,
            name:'Tan',
            wells:{},
            numwells:0,
            users:{}
          }).save$(function(err, entity){
            callback(err, events)
          })
      },
      // Add a team to a different event
      function(events, callback){
        teament.make$({
            num:0, 
            event:events[1].id, 
            eventcode:events[1].code,
            name:'Blue',
            wells:{},
            numwells:0,
            users:{}
          }).save$(function(err, entity){
            callback(err)
          })
      },
      // Load users, but do not assign them to any events to allow tests for custom setup
      function(callback){
        // Use the cmd:register action of the seneca-user plugin to register the fake users
        // This ensures they are created properly
        seneca.act('role:user,cmd:register',{nick:'u1',name:'n1',password:'p1'}, function(err, data){
          callback(err)
        })
      },
      function(callback){
        seneca.act('role:user,cmd:register',{nick:'u2',name:'n2',password:'p2'}, function(err, data){
          callback(err)
        })
      },
      function(callback){
        seneca.act('role:user,cmd:register',{nick:'u3',name:'n3',password:'p3'}, function(err, data){
          callback(err)
        })
      },
      function(callback){
        seneca.act('role:user,cmd:register',{nick:'u4',name:'n4',password:'p4'}, function(err, data){
          done(err)
        })
      }
    ])
  })

  it('cmd:leader', function(done){

    async.waterfall([
      // Loading events from db
      function(callback){
        eventent.list$(function(err,events){
            callback(err, events)
        })
      },
      function(events, callback){
        // Get list of teams in event 0 through leader cmd
        seneca.act('role:well, cmd:leader', {event:events[0]}, function(err, leader){
          callback(err, events, leader)
        })
      },
      function(events, leader, callback){
        // Get list of teams in event 0 directly from db
        teament.list$({event:events[0].id},function(err,dbteams){

          // Format both lists into arrays of names(leader does not contain id data)
          dbteams = dbteams.map(function (element) {
            return element.name
          })
          leader = leader.teams.map(function (element) {
            return element.name
          })

          // Compare team names
          assert.deepEqual(dbteams, leader)

          // Make sure an unwanted element is not contained within the array
          assert.equal(leader.indexOf('Blue'),-1)
          done(err)
        })
      }
    ])
  })

  it ('cmd:members', function(done){
    async.waterfall([
      // Loading events from db
      function(callback){
        eventent.list$(function(err,events){
          callback(err, events)
        })
      },
      // Loading users from db
      function(events, callback){
        userent.list$(function(err,users){
          callback(err, events, users)
        })
      },
      // Insert all users into event 1
      function(events, users, callback){
        var count = 0
        _.each(users, function(user){
          seneca.act('role:well, cmd:joinevent', {user:user, event:events[1]}, function(err, data){
            count++
            if (count < users.length) return
            callback(err)
          })
        })
      },
      // Loading events from db to refresh data
      function(callback){
        eventent.list$(function(err,events){
          callback(err, events)
        })
      },
      // Loading teams of event B from db
      function(events, callback){
        teament.list$({event:events[1].id},function(err,teams){
          callback(err, teams)
        })
      },
      // Loading a known user from that team
      function(teams, callback){
        userent.load$({nick:'admin'},function(err,user){
          callback(err, teams, user)
        })
      },
      // Obtaining members
      function(teams, user, callback){

        seneca.act('role:well, cmd:members', {team:teams[0], user:user}, function(err, members){
          callback(err, teams, members)
        })
      },
      // Comparing db against members return
      function(teams, members, callback){

        // admin is being removed, because it's supplied into members call as the user to be ignored

        // Removing admin from list which is db clone
        // Storing db members in an array
        var dbnames = []
          _.each(teams[0].users,function(teamuser){
            if (teamuser.name != 'admin') dbnames.push(teamuser.name)
          })

          // Storing returned members in an array
          var memnames = []
          _.each(members.members,function(member){
            memnames.push(member.name)
          })

          // Making sure does not contain admin
          assert.equal((memnames.indexOf("admin") == -1), true)

          // Making sure db elements are same as returned elements
          assert.deepEqual(dbnames, memnames)

          callback()
      }
    ], done)
  })

  it ('cmd:whoami', function(done){
    assert.equal('TO BE IMPLEMENTED', 1)
    // TODO
    done()
  })

  it ('cmd:well', function(done){
    assert.equal('TO BE IMPLEMENTED', 1)
    // TODO
    done()
  })

  it ('cmd:member', function(done){
    assert.equal('TO BE IMPLEMENTED', 1)
    // TODO
    done()
  })

  it ('cmd:createevent', function(done){
    assert.equal('TO BE IMPLEMENTED', 1)
    // TODO
    done()
  })

  it ('cmd:joinevent', function(done){
    assert.equal('TO BE IMPLEMENTED', 1)
    // TODO
    done()
  })
})