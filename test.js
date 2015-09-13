
    var async = require('async');
    var _ = require('lodash');
    var util = require('util');

    function sfunc(qfunc, q, field, cb){
      if (_.isFunction(q)) q = q();
      qfunc(q, function(err, res){
        // err checking n' stuff
        // (...) 

        // expose res as field
        if (field) scontext[field] = res;
        cb(err, res, cb);
      })
    }

    var entity1 = {
      do: function(args, cb){
        console.log('args: ' + util.inspect(args));
        return cb(null, 'something');
      }
    }

    var scontext = {}
    async.series([
      sfunc.bind(null, entity1.do, {}, 'sample'),
      sfunc.bind(null, entity1.do, function() { return { any: scontext.sample } }, 'sample'),
      function(cb){
        console.log(scontext.sample);
        console.log('happy days');
        cb();
      }
      ], function(){
        console.log(scontext.sample);
        console.log('happy end');
      });