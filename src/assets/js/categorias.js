$(document).bind("contextmenu", function (e) {
  e.preventDefault();
});
$(document).keydown(function (e) {
  if (e.which === 123) {
    return false;
  }
});
var queryString = window.location.search;
var urlParams = new URLSearchParams(queryString);
var city = urlParams.get("city");

var hr = new XMLHttpRequest();
var url = "api/infotypes.php";
var vars = "city=" + city;
hr.open("POST", url, true);
hr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
hr.onreadystatechange = function () {
  if (hr.readyState == 4 && hr.status == 200) {
    var return_data = hr.responseText;
    var status = JSON.parse(return_data);
    var go1 = "";
    var go2 = "";
    var go3 = "";
    var go4 = "";
    var go5 = "";
    var go6 = "";
    if (status["status"] == "avaliable") {
      $("#title h1").html(status["city"]);
      $("title").html("PedeJá - " + status["city"]);
      if (status["type1"] == "true") {
        go1 = 'onclick="gotoplace(1)"';
      }
      if (status["type2"] == "true") {
        go2 = 'onclick="gotoplace(2)"';
      }
      if (status["type3"] == "true") {
        go3 = 'onclick="gotoplace(3)"';
      }
      if (status["type4"] == "true") {
        go4 = 'onclick="gotoplace(4)"';
      }
      if (status["type5"] == "true") {
        go5 = 'onclick="gotoplace(5)"';
      }
      if (status["type6"] == "true") {
        go6 = 'onclick="gotoplace(6)"';
      }
      $("#tipo").html(`
                  <li id="tipo-1" class="tipo ${status["type1"]}" ${go1}></li>
                  <li id="tipo-2" class="tipo ${status["type2"]}" ${go2}></li>
                  <li id="tipo-3" class="tipo ${status["type3"]}" ${go3}></li>
                  <li id="tipo-4" class="tipo ${status["type4"]}" ${go4}></li>
                  <li id="tipo-5" class="tipo ${status["type5"]}" ${go5}></li>
                  <li id="tipo-6" class="tipo ${status["type6"]}" ${go6}></li>`);
    } else if (status["status"] == "comingsoon") {
      window.location.href = "https://pedeja.pt/brevemente.html";
    } else if (status["status"] == "suspended") {
      window.location.href = "https://pedeja.pt/suspenso.html";
    } else if (status["status"] == "overloaded") {
      window.location.href = "https://pedeja.pt/sobrecarregado.html";
    } else if (status["status"] == "notfound") {
      window.location.href = "https://pedeja.pt/indisponivel.html";
    } else if (status["status"] == "error") {
      window.location.href = "https://pedeja.pt/404.html";
    } else {
      window.location.href = "https://pedeja.pt/404.html";
    }
  }
};
hr.send(vars);

function gotoplace(tipo) {
  let avaliable = tipo;
  let hr = new XMLHttpRequest();
  let url = "api/infotypes.php";
  let vars = "city=" + city + "&type=" + avaliable + "";
  hr.open("POST", url, true);
  hr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  hr.onreadystatechange = function () {
    if (hr.readyState == 4 && hr.status == 200) {
      let return_data = hr.responseText;
      let status = JSON.parse(return_data);

      if (status["status"] == "avaliable") {
        if (city == "barcelos") {
          if (avaliable == 2) {
            window.location.replace(
              "https://www.foodbooking.com/ordering/restaurant/menu?restaurant_uid=fff6fd78-35e9-4fd2-ae48-f788656ce97f&client_is_mobile=true"
            );
          } else if (avaliable == 3) {
            window.location.replace(
              "https://www.foodbooking.com/ordering/restaurant/menu?company_uid=ae60f8e0-95f8-4003-81ec-2844fd79cd7d&restaurant_uid=e7900fb0-4c25-4241-b592-7a2b439f08fe&facebook=true"
            );
          } else if (avaliable == 6) {
            window.location.replace(
              "https://www.foodbooking.com/ordering/restaurant/menu?company_uid=ae60f8e0-95f8-4003-81ec-2844fd79cd7d&restaurant_uid=8eb78ad4-ec66-46a0-af7d-b59466c3bd8a&facebook=true"
            );
          } else if (avaliable == 4) {
            window.location.replace(
              "https://www.foodbooking.com/ordering/restaurant/menu?company_uid=ae60f8e0-95f8-4003-81ec-2844fd79cd7d&restaurant_uid=e7900fb0-4c25-4241-b592-7a2b439f08fe&facebook=true"
            );
          } else {
            document.body.innerHTML +=
              '<form id="dynForm" action="https://pedeja.pt/estabelecimentos.html" method="get"><input type="hidden" name="type" value="' +
              avaliable +
              '"><input type="hidden" name="city" value="' +
              city +
              '"></form>';
            document.getElementById("dynForm").submit();
          }
        } else if (city == "famalicao") {
          if (avaliable == 2) {
            window.location.replace(
              "#"
            );
          } else if (avaliable == 3) {
            window.location.replace(
              "#"
            );
          } else if (avaliable == 6) {
            window.location.replace(
              "#"
            );
          } else if (avaliable == 4) {
            window.location.replace(
              "#"
            );
          } else {
            document.body.innerHTML +=
              '<form id="dynForm" action="https://pedeja.pt/estabelecimentos.html" method="get"><input type="hidden" name="type" value="' +
              avaliable +
              '"><input type="hidden" name="city" value="' +
              city +
              '"></form>';
            document.getElementById("dynForm").submit();
          }
        } else if (city == "vila_verde") {
          if (avaliable == 2) {
            window.location.replace(
              "#"
            );
          } else if (avaliable == 3) {
            window.location.replace(
              "#"
            );
          } else if (avaliable == 6) {
            window.location.replace(
              "#"
            );
          } else if (avaliable == 4) {
            window.location.replace(
              "#"
            );
          } else {
            document.body.innerHTML +=
              '<form id="dynForm" action="https://pedeja.pt/estabelecimentos.html" method="get"><input type="hidden" name="type" value="' +
              avaliable +
              '"><input type="hidden" name="city" value="' +
              city +
              '"></form>';
            document.getElementById("dynForm").submit();
          }
        } else {
          window.location.href = "https://pedeja.pt/404.html";
        }
      } else {
        window.location.href = "https://pedeja.pt/404.html";
      }
    }
  };
  hr.send(vars);
}
window.addEventListener("pageshow", function (event) {
  var historyTraversal =
    event.persisted ||
    (typeof window.performance != "undefined" &&
      window.performance.navigation.type === 2);
  if (historyTraversal) {
    window.location.reload();
  }
});
