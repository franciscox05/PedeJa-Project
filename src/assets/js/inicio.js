
$(document).bind("contextmenu",function(e) {
  e.preventDefault();
});
$(document).keydown(function(e){
  if(e.which === 123){
    return false;
}
});


function gocity(cityvar){
    if (cityvar == '' || cityvar == 'null' || cityvar == 'false' || cityvar == 'true' || cityvar == 'empty') {
    
  }else{
  var str1 = (cityvar).replace(/\s+/g, '');
  var str2 = str1.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  var city = str2.toLowerCase();

  
    var hr = new XMLHttpRequest();
    var url = "api/infocitys.php";
    var vars = "city="+city;
    hr.open("POST", url, true);
    hr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
    hr.onreadystatechange = function() {
    if(hr.readyState == 4 && hr.status == 200) {
      var return_data = hr.responseText;
      var status = JSON.parse(return_data);
      if(status['status'] == 'avaliable'){
        document.body.innerHTML += '<form id="dynForm" action="https://pedeja.pt/categorias.html?v=1.0.0" method="get"><input type="hidden" name="city" value="'+city+'"></form>';
        document.getElementById("dynForm").submit();
      }else
      if(status['status'] == 'comingsoon'){
        window.location.href = 'https://pedeja.pt/brevemente.html';
      }else
      if(status['status'] == 'suspended'){
        window.location.href = 'https://pedeja.pt/suspenso.html?city='+city;
      }else
      if(status['status'] == 'overloaded'){
        window.location.href = 'https://pedeja.pt/sobrecarregado.html';
      }else
      if(status['status'] == 'notfound'){
        window.location.href = 'https://pedeja.pt/indisponivel.html';
      }else
      if(status['status'] == 'error'){
        window.location.href = 'https://pedeja.pt/404.html';
      }else
      {
        window.location.href = 'https://pedeja.pt/404.html';
      }
    }
  }
  hr.send(vars); 
}
}


$('#gotocity').click( function ajax_post(){
  
});


window.addEventListener( "pageshow", function ( event ) {
  var historyTraversal = event.persisted || 
                         ( typeof window.performance != "undefined" && 
                              window.performance.navigation.type === 2 );
  if ( historyTraversal ) {
    window.location.reload();
  }
});