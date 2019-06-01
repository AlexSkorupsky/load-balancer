var a,b,c;
var WebSocket = require("ws");
var wss = new WebSocket.Server({ port: 8080 });
wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
        var object = JSON.parse(message).object;
        console.log("server 1 starts working on a task (" + object.N + ")");
        a = 0;
        b = 0;
        c = 0;
        for (let i = 0; i<object.N; ++i)
        {
            let previous = 0;
            if (i != 0)
            {
                previous = Math.floor(100*(i-1)/object.N);
            }
            let current = Math.floor(100*i/object.N);
            if (current > previous)
            {
                ws.send(JSON.stringify({id : object.Id, status : "progress", progress : Math.floor(i*100/object.N)}));
            }
            for (let j = 0; j<object.N; ++j)
            { 
                for(let k = 0; k<object.N; ++k)
                {
                    c+= j*k+i/2;
                    b+=c*j;
                    a= b-c;
                }
            }
        }
        console.log("server 1 completed working on a task");
        ws.send(JSON.stringify({id : object.Id, status : "result", result : [object.N, a, b, c]}));
    });
});
