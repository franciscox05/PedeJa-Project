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
var type = urlParams.get("type");
load(city, type);

function load(city, type) {
  var hr = new XMLHttpRequest();
  var url_estab = "api/infoplaces.php";
  var vars_estab = "city=" + city + "&type=" + type;
  hr.open("POST", url_estab, true);
  hr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  hr.onreadystatechange = function () {
    if (hr.readyState == 4 && hr.status == 200) {
      var return_data_estab = hr.responseText;
      var status_estab = JSON.parse(return_data_estab);
      $("#tipo").html(status_estab["typename"]);
      $("#nome").html(status_estab["city"]);
      $("title").html(
        "PedeJá - " + status_estab["city"] + " - " + status_estab["typename"]
      );
      if (status_estab["status"] == "avaliable") {
        categories(city, type);
        let places = status_estab["places"];
        places.sort((a, b) => a.ordem - b.ordem);
        let pjcode = status_estab["pjcode"];
        let status;
        let tagsname;
        let tagsnameini;
        let tagsnameend;
        let color;

        if (places.length >= 1) {
          for (let i = 0; i < places.length; i++) {
            if (places[i]["status"] == 1) {
              if (places[i]["method"] == 2) {
                status = "PedeJá";
                tagsname = "";
                tagsnameini =
                  '<a class="linktorest" href="https://pedeja.pt/estabelecimento.html?type=' +
                  type +
                  "&city=" +
                  city +
                  "&estab=" +
                  places[i]["id"] +
                  '">';
                tagsnameend = "</a>";
                color = "on";
              } else {
                status = "PedeJá";
                tagsname = places[i]["code"];
                tagsnameini =
                  '<a class="linktorest" href="https://www.foodbooking.com/ordering/restaurant/menu?restaurant_uid=' +
                  tagsname +
                  '&client_is_mobile=true">';
                tagsnameend = "</a>";
                color = "on";
              }
            } else if (places[i]["status"] == 2) {
              status = "Sobrecarregado";
              tagsname = "";
              tagsnameini = "";
              tagsnameend = "";
              color = "off";
            } else {
              status = "Indisponível";
              tagsname = "";
              tagsnameini = "";
              tagsnameend = "";
              color = "off";
            }
            var classes = "";
            for (let x = 0; x < places[i]["categories"].length; x++) {
              classes =
                classes + " cat" + JSON.parse(places[i]["categories"][x]) + "";
            }

            $("#places").append(`
                    <div class="col-6 col-xs-6 col-sm-4 col-md-4 col-lg-3 col-xl-3 filterDiv ${classes}" >
                    ${tagsnameini}
                    <div class="card mb-3">
                        <img src="https://pedeja.pt/assets/img/thumbnails/${city}/${places[i]["id"]}.png" class="card-img-top ${color}" alt="${city}">
                        <div class="card-body">
                          <p class="card-text row">
                            <small class="text-muted col-12  col-md-7"><span class="material-icons inline-icon"><span class="material-icons-outlined">info_outline</span></span>   ${places[i]["info"]}</small>
                            <small class="text-muted col-12  col-md-5  estado ${color}"><span class="material-icons inline-icon"><span class="material-icons-outlined">radio_button_checked</span></span>   ${status}</small></p>
                        </div>
                      </div>
                      ${tagsnameend}
                    </div>
                  `);
          }
        } else {
          window.location.href = "https://pedeja.pt/404.html";
        }
      } else {
        window.location.href = "https://pedeja.pt/404.html";
      }
    }
  };
  hr.send(vars_estab);
}

const slider = document.querySelector(".scroll");
let isDown = false;
let startX;
let scrollLeft;

slider.addEventListener("mousedown", (e) => {
  isDown = true;
  slider.classList.add("active");
  startX = e.pageX - slider.offsetLeft;
  scrollLeft = slider.scrollLeft;
});
slider.addEventListener("mouseleave", () => {
  isDown = false;
  slider.classList.remove("active");
});
slider.addEventListener("mouseup", () => {
  isDown = false;
  slider.classList.remove("active");
});
slider.addEventListener("mousemove", (e) => {
  if (!isDown) return;
  e.preventDefault();
  const x = e.pageX - slider.offsetLeft;
  const walk = x - startX;
  slider.scrollLeft = scrollLeft - walk;
});

function filterSelection(c) {
  var x, i;
  x = document.getElementsByClassName("filterDiv");
  if (c == "todos") c = "";
  for (i = 0; i < x.length; i++) {
    w3RemoveClass(x[i], "show");
    if (x[i].className.indexOf(c) > -1) w3AddClass(x[i], "show");
  }
}

function w3AddClass(element, name) {
  var i, arr1, arr2;
  arr1 = element.className.split(" ");
  arr2 = name.split(" ");
  for (i = 0; i < arr2.length; i++) {
    if (arr1.indexOf(arr2[i]) == -1) {
      element.className += " " + arr2[i];
    }
  }
}

function w3RemoveClass(element, name) {
  var i, arr1, arr2;
  arr1 = element.className.split(" ");
  arr2 = name.split(" ");
  for (i = 0; i < arr2.length; i++) {
    while (arr1.indexOf(arr2[i]) > -1) {
      arr1.splice(arr1.indexOf(arr2[i]), 1);
    }
  }
  element.className = arr1.join(" ");
}

var btnContainer = document.getElementById("tags-menu");
var btns = btnContainer.getElementsByClassName("button");
for (var i = 0; i < btns.length; i++) {
  btns[i].addEventListener("click", function () {
    var current = document.getElementsByClassName("active");
    current[0].className = current[0].className.replace(" active", "");
    this.className += " active";
  });
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
