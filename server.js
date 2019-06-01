var http = require('http');
var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var mongo = require('mongodb');
var path = require('path');
var mongoose = require('mongoose');
var expressValidator = require('express-validator');
var flash = require('connect-flash');
var session = require('express-session');
var passport = require('passport');
var config = require('./config/database');
var cookieParser = require('cookie-parser');
var WebSocket = require("ws");

mongoose.connect(config.database);
var db = mongoose.connection;


db.once('open', function(){
    console.log("DB connected");
});
db.on('error', function(err){
    console.log(err);
});


var app = express();

//init mongo
var mc = mongo.MongoClient;
var mongourl = "mongodb://localhost:27017/";

var Product = require('./models/product');



app.use(bodyParser.urlencoded({ extended: false }))
var urlencodedParser = bodyParser.urlencoded({ extended: false })

app.use(bodyParser.json())
app.use(cookieParser('syla'));

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('static'));


app.use(session({
    secret: 'keyboard cat',
    resave: true,
    saveUninitialized: true
  }));


app.use(require('connect-flash')());
app.use(function (req, res, next) {
    res.locals.messages = require('express-messages')(req, res);
    next();
});


app.use(expressValidator({
    errorFormatter: function(param, msg, value) {
        var namespace = param.split('.')
        , root    = namespace.shift()
        , formParam = root;
  
      while(namespace.length) {
        formParam += '[' + namespace.shift() + ']';
      }
      return {
        param : formParam,
        msg   : msg,
        value : value
      };
    }
  }));


  require('./config/passport')(passport);
  app.use(passport.initialize());
  app.use(passport.session());

  
  var inProgress = [null, null, null, null];
  var ws = [  new WebSocket('ws://127.0.0.1:8080'),  
  new WebSocket('ws://127.0.0.1:8081')];
  var socketServer = new WebSocket.Server({ port: 8047 });
  socketServer.on('connection', function connection(webs) {
      webs.on('message', function incoming(id) {
          console.log(id);
          for (let i = 0; i<2; ++i)
          {
              if (inProgress[i] != null)
              {
                  let obj = inProgress[i];
                  if (obj.Id == id)
                  {
                      webs.send(JSON.stringify({id : id, progress : obj.Progress}));
                      mc.connect(mongourl, {useNewUrlParser:true}, function(err, db) {
                          if (err) 
                          {
                              throw err;
                          }
                          var dbo = db.db("web");
                          dbo.collection("calculations").updateOne({_id: id}, {$set : {Progress: obj.Progress}}, function(err){
                              if (err)
                              {
                                  db.close();
                                  throw err;
                              }
                              console.log("updated progress");
                              db.close();
                          });
                      });
                      return;
                  }
              }
          }
          mc.connect(mongourl, {useNewUrlParser:true}, function(err, db) {
              if (err) 
              {
                  throw err;
              }
              var dbo = db.db("web");
              dbo.collection("calculations").findOne({_id: mongo.ObjectID(id)}, function(err, calcs){
                  if (err)
                  {
                      db.close();
                      throw err;
                  }
                  if (calcs == null)
                  {
                      console.log("failed to find object with id "+ id);
                  } else
                  {
                      webs.send(JSON.stringify({id : id, progress : calcs.Progress}));
                  }
                  db.close();                
              });
          });
      });
      for (let i = 0; i<2; ++i)
      {
          ws[i].on('message', function(event)
          {
              var msg = JSON.parse(event);
              if (msg.status == "progress")
              {
                  webs.send(JSON.stringify({id : msg.id, progress : msg.progress}));
              }
              if (msg.status == "result")
              {
                  webs.send(JSON.stringify({id : msg.id, progress : 100}));
              }
          });
      }
  });
  for (let i = 0; i<2; ++i)
  {
      ws[i].on('message', function(event)
      {
          var msg = JSON.parse(event);
          console.log(msg);
          if (msg.status == "progress")
          {
              inProgress[i].Progress = msg.progress;
          }
          if (msg.status == "result")
          {
              stopCalculation(i, msg.result);
          }
      });
  }
  
  function startCalculation(wsId)
  {
      if (inProgress[wsId] != null)
      {
          console.log("failed to run on a busy server");
          return;
      }
      inProgress[wsId] = 1;
      mc.connect(mongourl, {useNewUrlParser:true}, function(err, db) {
          if (err) 
          {
              inProgress[wsId] = null;
              throw err;
          }
          var dbo = db.db("web");
          dbo.collection("calculations").findOneAndUpdate({Progress: -1}, {$set: {Progress : 0}}, { sort : {TimeAndDate : 1}}, function(err, calcs){
              if (err)
              {
                  inProgress[wsId] = null;
                  throw err;
              }
              if (!calcs.value)
              {
                  inProgress[wsId] = null;
                  console.log("no elements in the queue");
              } else
              {
                  inProgress[wsId] = {
                      Id : calcs.value._id,
                      Tvalue : calcs.value.Tvalue,
                      Bvalue : calcs.value.Bvalue,
                      Svalue : calcs.value.Svalue,
                      Fvalue : calcs.value.Fvalue,
                      N : calcs.value.N,
                      Progress : 0,
                      Keyword : calcs.value.Keyword,
                      Result : [0],
                      TimeAndDate : calcs.value.TimeAndDate
                  }
                  ws[wsId].send(JSON.stringify({object : inProgress[wsId], server : wsId}));
                  console.log("calculation started");
                  console.log(inProgress[wsId]);
              }
              db.close();
          });
      });
  }
  function stopCalculation(wsId, result)
  {
      let oldId = inProgress[wsId].Id;
      inProgress[wsId] = null;
      mc.connect(mongourl, {useNewUrlParser:true}, function(err, db) {
          if (err) 
          {
              throw err;
          }
          var dbo = db.db("web");
          dbo.collection("calculations").updateOne({_id: oldId}, {$set : {Progress: 100, Result : result}}, function(err){
              if (err)
              {
                  db.close();
                  throw err;
              }
              console.log("completed calculation");
              startCalculation(wsId);
              db.close();
          });
      });
  }
  
app.get('*', function(req, res, next){
    res.locals.user = req.user || null;
    next();
  });

app.get('/', function(req, res) {
    var query = { pageid: 1 };
    Product.find(query, function(err, products){
        if(err){
            console.log(err);
        } else {
            res.render("index", {
                title: "Home",
                products: products,
                pageid: 1
            });
        }
    }); 
});

//Todo: add titles to other pages(prdct, lgn...)
app.get('/index', function(req, res) {
    var query = { pageid: 1 };
    Product.find(query, function(err, products){
        if(err){
            console.log(err);
        } else {
            res.render("index", {
                title: "Home",
                products: products,
                pageid: 1
            });
        }
    });
});

app.get('/index/:pageid', function(req, res) {
    var query = { pageid: req.params.pageid };
    Product.find(query, function(err, products){
        if(err){
            console.log(err);
        } else {
            res.render("index", {
                title: "Home",
                products: products,
                pageid: req.params.pageid
            });
        }
    }); 
});

app.get('/result/:id', function(req, res)
{
    if (req.params.id.length != 24)
    {
        console.log("object with id " + req.params.id + "was not found");
        res.redirect('/history');
        return;
    }
    mc.connect(mongourl, {useNewUrlParser:true}, function(err, db) {
        if (err) throw err;
        var dbo = db.db("web");
        dbo.collection("calculations").findOne({_id : mongo.ObjectId(req.params.id)}, function(err, calcs) {
            if (err) throw err;
            if (!calcs)
            {
                console.log("object with id " + req.params.id + "was not found");
                res.redirect("/history");
                db.close();
            } else
            {
                res.send(calcs.Result);
                db.close();
            }
        });
    });
});

app.get('/create', function(req, res)
{
    res.render("create", {userData :req.signedCookies.userData});
});

app.post('/create', function(req, res)
{
    var object = {
        Tvalue : req.body.Tvalue,
        Bvalue : req.body.Bvalue,
        Svalue : req.body.Svalue,
        Fvalue : req.body.Fvalue,
        N : req.body.N,
        Progress : -1,
        Keyword : getKeyword(req),
        Result : [0],
        TimeAndDate : new Date()
    }
    mc.connect(mongourl, {useNewUrlParser:true}, function(err, db) {
        if (err) 
        {
            throw err;
        }
        var dbo = db.db("web");
        dbo.collection("calculations").insertOne(object, function(err, result) {
            if (err) throw err;
            console.log("calculation added in database");
            res.redirect('/history');
            db.close();
            for (let i = 0; i<2; ++i)
            {
                if (inProgress[i] == null)
                {
                    startCalculation(i);
                    break;
                }
            }
        });
    });
});

app.get('/history', function(req, res)
{
    mc.connect(mongourl, {useNewUrlParser:true}, function(err, db) {
        if (err) throw err;
        var dbo = db.db("web");
        dbo.collection("calculations").find({Keyword : getKeyword(req)}).sort({TimeAndDate: -1}).limit(20).toArray(function(err, calcs) {
            if (err) throw err;
            res.render('history', {keyword : getKeyword(req), calcs, userData : req.signedCookies.userData});
            db.close();
        });
    });
});

app.get('/set-keyword', function(req, res)
{
    res.render("set-keyword", {userData :req.signedCookies.userData});
});
app.post('/set-keyword', function(req, res)
{
    res.cookie('keyword', JSON.stringify({keyword : req.body.keyword}), {signed: true});
    res.redirect('/history');    
});

var products = require('./routes/products');
var users = require('./routes/users');
app.use('/users', users);
app.use('/products', products);


app.get('/error404', function(req, res) {
    res.render("error404", {
        title: "Error 404"
    });
});

//to do: image get template
app.get('/images/HTML-404-Error-Page.gif', function(req, res) {
});

app.get('/images/xps-15.jpg', function(req, res) {
});



app.get('/css/style.css', function(req, res) {
    //if (1) then use /static/css/style.css
});

app.get('/css/footer.css', function(req, res) {
    //if (1) then use /static/css/style.css
});

app.get('/css/product.css', function(req, res) {
    //if (1) then use /static/css/style.css
});

app.get('/css/buttons.css', function(req, res) {
    //if (1) then use /static/css/style.css
});

app.get('/scripts/errorMenuScript.js', function(req, res) {
    // if (1) then...
});

app.get('/scripts/menuScript.js', function(req, res) {
    // if (1) then...
    //res.sendFile(__dirname + "/menuScript.js");
});

app.get('/scripts/delete.js', function(req, res) {  
});

app.get('/scripts/index_view.js', function(req, res) {   
});

app.get('/bower_components/jquery/dist/jquery.js', function(req, res) { });
app.get('/bower_components/bootstrap/dist/css/bootstrap.js', function(req, res) { });

app.listen(3000);