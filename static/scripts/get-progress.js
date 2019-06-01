$(document).ready(function()
{
    var socket = new WebSocket('ws://127.0.0.1:8047'); 
    socket.onmessage = function(event) {
        let object = JSON.parse(event.data);
        if (object.progress >= 0 && object.progress < 100)
        {
            $("#"+object.id+".progress-block").show();
            $("#"+object.id+".result-block").hide();
            $("#"+object.id+".queue-block").hide();
            $("#"+object.id+".progress").attr("aria-valuenow", object.progress);
            $("#"+object.id+".progress").css("width", object.progress+"%");
            $("#"+object.id+".progress").text(object.progress+"%");
        } else
        {
            window.location.href = '/history';
        }
    };
    $('.get-progress').click(function(e)
    {
        e.preventDefault();
        $target =  $(e.target);
        const id = $target.attr('id');
        socket.send(id);
    });  
});
  