var io = require( 'socket.io' );
var mongoose = require( '../models.js' ).mongoose;
var Lecture = mongoose.model( 'Lecture' );

module.exports = function(app, external_io, methods) {
  
  if (external_io) {
    io = external_io;
  } else {
    io.listen(app);
  }



var backchannel = io
.on( 'connection', function( socket ) {

  socket.on('subscribe', function(lecture, cb) {
    socket.join(lecture);
    methods.subscribe(lecture, function(posts) {
      if (socket.handshake.user) {
        Lecture.findOne({'_id': lecture}, function(err, lect) {
          // This also passes the courseId on to backchannel to selectively turn off comments
          // FIXME: ideally this would be a part of the Lecture/Course schema
          var packet = {'posts':posts,'toggle':lect.course};
          cb(packet);
        });
      } else {
        var posts = posts.filter(function(post) {
          if (post.public) {
            return post;
          }
        })
        cb(posts)
      }
    })
  });

  socket.on('post', function(res) {
    var newPost = res.post;
    var lecture = res.lecture;
    methods.post(function(post, save) {
      post.lecture = lecture;
      if ( newPost.anonymous ) {
        post.userid		= 0;
        post.userName	= 'Anonymous';
        post.userAffil = 'N/A';
      } else {
        post.userName = newPost.userName;
        post.userAffil = newPost.userAffil;
      }

      post.public = newPost.public;
      post.date = new Date();
      post.body = newPost.body;
      post.votes = [];
      post.reports = [];
      save(function() {
        if (post.public) {
          backchannel.in(lecture).emit('post', post);
        } else {
          privateEmit(lecture, 'post', post);
        }
      })
    })
  });

  socket.on('vote', function(res) {
    var vote = res.vote;
    var lecture = res.lecture;
    methods.items(vote.parentid, function(post, save) {
      if (post.votes.indexOf(vote.userid) == -1) {
        post.votes.push(vote.userid);
        save(function() {
          if (post.public) {
            backchannel.in(lecture).emit('vote', vote);
          } else {
            privteEmit(lecture, 'vote', vote);
          }
        })
      }
    })
  });

  socket.on('report', function(res) {
    var report = res.report;
    var lecture = res.lecture;
    methods.items(report.parentid, function(post, save) {
      if (post.reports.indexOf(report.userid) == -1) {
        post.reports.push(report.userid);
        save(function() {
          if (post.public) {
            backchannel.in(lecture).emit('report', report);
          } else {
            privateEmit(lecture, 'report', report);
          }
        })
      }
    })
  });

  socket.on('comment', function(res) {
    var comment = res.comment;
    var lecture = res.lecture;
    if ( comment.anonymous ) {
      comment.userid		= 0;
      comment.userName	= 'Anonymous';
      comment.userAffil = 'N/A';
    }
    methods.items(comment.parentid, function(post, save) {
      post.comments.push(comment);
      post.date = new Date();
      save(function() {
        if (post.public) {
          backchannel.in(lecture).emit('comment', comment);
        } else {
          privateEmit(lecture, 'comment', comment);
        }
      })
    })
  });

  function privateEmit(lecture, event, data) {
    backchannel.clients(lecture).forEach(function(socket) {
      if (socket.handshake.user)
        socket.emit(event, data);
    })
  }

  socket.on('disconnect', function() {
    //delete clients[socket.id];
  });
});
}

