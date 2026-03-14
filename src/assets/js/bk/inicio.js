
$(document).bind("contextmenu",function(e) {
  e.preventDefault();
});
$(document).keydown(function(e){
  if(e.which === 123){
    return false;
}
});

function ApenasLetras(e, t) {
  try {
      if (window.event) {
          var charCode = window.event.keyCode;
      } else if (e) {
          var charCode = e.which;
      } else {
          return true;
      }
      if ((charCode > 64 && charCode < 91) || (charCode > 96 && charCode < 123) || (charCode == 32))
          return true;
      else
          return false;
  } catch (err) {
      alert(err.Description);
  }
}


function autocomplete(inp, arr) {
  var currentFocus;
  inp.addEventListener("input", function(e) {
      var a, b, i, val = this.value;
      closeAllLists();
      if (!val) { return false;}
      currentFocus = -1;
      a = document.createElement("DIV");
      a.setAttribute("id", this.id + "autocomplete-list");
      a.setAttribute("class", "autocomplete-items");
      this.parentNode.appendChild(a);
      for (i = 0; i < arr.length; i++) {
        if (arr[i].substr(0, val.length).toUpperCase() == val.toUpperCase()) {
          b = document.createElement("DIV");
          b.innerHTML = "<strong>" + arr[i].substr(0, val.length) + "</strong>";
          b.innerHTML += arr[i].substr(val.length);
          b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
          b.addEventListener("click", function(e) {
       
              inp.value = this.getElementsByTagName("input")[0].value;
              
              closeAllLists();
          });
          a.appendChild(b);
        }
      }
  });
  inp.addEventListener("keydown", function(e) {
      var x = document.getElementById(this.id + "autocomplete-list");
      if (x) x = x.getElementsByTagName("div");
      if (e.keyCode == 40) {
        currentFocus++;
        addActive(x);
      } else if (e.keyCode == 38) { 
        currentFocus--;
        addActive(x);
      } else if (e.keyCode == 13) {
        e.preventDefault();
        if (currentFocus > -1) {
          if (x) x[currentFocus].click();
        }
      }
  });
  function addActive(x) {
    if (!x) return false;
    removeActive(x);
    if (currentFocus >= x.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = (x.length - 1);
    x[currentFocus].classList.add("autocomplete-active");
  }
  function removeActive(x) {
    for (var i = 0; i < x.length; i++) {
      x[i].classList.remove("autocomplete-active");
    }
  }
  function closeAllLists(elmnt) {
    var x = document.getElementsByClassName("autocomplete-items");
    for (var i = 0; i < x.length; i++) {
      if (elmnt != x[i] && elmnt != inp) {
        x[i].parentNode.removeChild(x[i]);
      }
    }
  }
  document.addEventListener("click", function (e) {
      closeAllLists(e.target);
  });
}

var cidades = ["Abrantes",
"Agualva-Cacém",
"Águeda",
"Albufeira",
"Alcácer do Sal",
"Alcobaça",
"Almada",
"Almeirim",
"Alverca do Ribatejo",
"Amadora",
"Amarante",
"Amora",
"Angra do Heroísmo",
"Aveiro",
"Barcelos",
"Barreiro",
"Beja",
"Borba",
"Braga",
"Bragança",
"Caldas da Rainha",
"Câmara de Lobos",
"Caniço",
"Cantanhede",
"Cartaxo",
"Castelo Branco",
"Chaves",
"Coimbra",
"Costa da Caparica",
"Covilhã",
"Elvas",
"Entroncamento",
"Ermesinde",
"Esmoriz",
"Espinho",
"Esposende",
"Estarreja",
"Estremoz",
"Évora",
"Fafe",
"Faro",
"Fátima",
"Felgueiras",
"Figueira da Foz",
"Fiães",
"Freamunde",
"Funchal",
"Fundão",
"Gafanha da Nazaré",
"Gandra",
"Gondomar",
"Gouveia",
"Guarda",
"Guimarães",
"Horta",
"Ílhavo",
"Lagoa",
"Lagos",
"Lamego",
"Leiria",
"Lisboa",
"Lixa",
"Loulé",
"Loures",
"Lourosa",
"Macedo de Cavaleiros",
"Machico",
"Maia",
"Mangualde",
"Marco de Canaveses",
"Marinha Grande",
"Matosinhos",
"Mealhada",
"Mêda",
"Miranda do Douro",
"Mirandela",
"Montemor-o-Novo",
"Montijo",
"Moura",
"Odivelas",
"Olhão",
"Oliveira de Azeméis",
"Oliveira do Bairro",
"Oliveira do Hospital",
"Ourém",
"Ovar",
"Paços de Ferreira",
"Paredes",
"Penafiel",
"Peniche",
"Peso da Régua",
"Pinhel",
"Pombal",
"Ponta Delgada",
"Ponte de Lima",
"Ponte de Sor",
"Portalegre",
"Portimão",
"Porto",
"Póvoa de Santa Iria",
"Póvoa de Varzim",
"Praia da Vitória",
"Quarteira",
"Queluz",
"Rebordosa",
"Reguengos de Monsaraz",
"Ribeira Grande",
"Rio Maior",
"Rio Tinto",
"Sabugal",
"Sacavém",
"Samora Correia",
"Santa Comba Dão",
"Santa Cruz",
"Santa Maria da Feira",
"Santana",
"Santarém",
"Santiago do Cacém",
"Santo Tirso",
"São João da Madeira",
"São Mamede de Infesta",
"São Pedro do Sul",
"São Salvador de Lordelo",
"Seia",
"Seixal",
"Senhora da Hora",
"Serpa",
"Setúbal",
"Silves",
"Sines",
"Tarouca",
"Tavira",
"Tomar",
"Tondela",
"Torres Novas",
"Torres Vedras",
"Trancoso",
"Trofa",
"Valbom",
"Vale de Cambra",
"Valença",
"Valongo",
"Valpaços",
"Vendas Novas",
"Viana do Castelo",
"Vila Baleira",
"Vila do Conde",
"Vila Franca de Xira",
"Vila Nova de Famalicão",
"Vila Nova de Foz Côa",
"Vila Nova de Gaia",
"Vila Nova de Santo André",
"Vila Real",
"Vila Real de Santo António",
"Viseu",
"Vizela"];


autocomplete(document.getElementById("cidade"), cidades);

$('#gotocity').click( function ajax_post(){
  if ($('#cidade').val() == '' || $('#cidade').val() == 'null' || $('#cidade').val() == 'false' || $('#cidade').val() == 'true' || $('#cidade').val() == 'empty') {
    
  }else{
  var str1 = ($('#cidade').val()).replace(/\s+/g, '');
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
});


window.addEventListener( "pageshow", function ( event ) {
  var historyTraversal = event.persisted || 
                         ( typeof window.performance != "undefined" && 
                              window.performance.navigation.type === 2 );
  if ( historyTraversal ) {
    window.location.reload();
  }
});