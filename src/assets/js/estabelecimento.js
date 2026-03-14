
$(document).bind("contextmenu",function(e) {
  e.preventDefault();
});
$(document).keydown(function(e){
  if(e.which === 123){
    return false;
}
});


  var nuor = (Math.floor(Math.random() * 99999999) + 10000000);
  var sendemail ='';
  var sendname ='';
  var sendorder ='';
  var senduser ='';
  var queryString = window.location.search;
  var urlParams = new URLSearchParams(queryString);
  var city = urlParams.get('city');
  var type = urlParams.get('type');
  var estab = urlParams.get('estab');
  load(city,type,estab);
  var data;
  var count = 0;
  var cid,adre,cont,nam;
  var tempo;
  var pmvali,d;
  var st=0,tt=0,ds=0,tx=0,subcost=0,cost=0;
  var orderItem = [];
  var itemval = [];
  const reducer = (accumulator, currentValue) => accumulator + currentValue;
  var btnContainer = document.getElementById("tags-menu");
  var btns = btnContainer.getElementsByClassName("button");
  const slider = document.querySelector(".scroll");
  let isDown = false;
  let startX;
  let scrollLeft;
  var info_nome = '';
  var info_contato = '';
  var info_email = '';
  var info_rua = '';
  var info_porta = '';
  var info_freguesia = '';
  var info_postal = '';
  var info_pay = '';
  var info_instru = '';
  var datah = new Date().toLocaleString("en-US", {timeZone: "Europe/Lisbon"});
  datah = new Date(datah);
  var diadasemana = datah.getDay();
  var datahoje = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-'+datah.getDate();
  var hoje = datah.getDate();
  var horahoje ;
  var datadis;
  var cpro=0;
  var outline = true;


$('#tab2 button span').text(cpro);
var require=[];



  if (datah.getHours() < 10 && datah.getMinutes() < 10) {
    horahoje = '0'+datah.getHours()+':0'+datah.getMinutes();
  }else{
    if (datah.getHours() < 10) {
      horahoje = '0'+datah.getHours()+':'+datah.getMinutes();
      
    }
    if (datah.getMinutes() < 10) {
      horahoje = datah.getHours()+':0'+datah.getMinutes();
    }
  }

  if ((datah.getMonth()+1) < 10 && datah.getDate() < 10) {
    datahoje = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-0'+datah.getDate();
  }else{
    if ((datah.getMonth()+1) < 10) {
      datahoje = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-'+datah.getDate();
    }
    if (datah.getDate() < 10) {
      datahoje = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-0'+datah.getDate();
    }
  }
  var horadev;
  var datadev;
  var today;
  var todaym;
  var whn = 1;

  
function  load(city,type,estab) {
 
  var hr = new XMLHttpRequest();
  var url = "api/infoplace.php";
  var vars = "city="+city+"&type="+type+"&estab="+estab;
  hr.open("POST", url, true);
  hr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
  hr.onreadystatechange = function() {
    if(hr.readyState == 4 && hr.status == 200) {
      var return_data = hr.responseText;
       data = JSON.parse(return_data);
      if(data['status'] == 'avaliable'){

      
          cid=data.city;
          adre=data.adress;
          cont=data.contact;
          nam=data.name;
          tempo = data.time;
          print(data);
          printime(tempo,diadasemana);
          cls();
       
       
      }else
      if(data['status'] == 'comingsoon'){
        window.location.href = 'https://pedeja.pt/brevemente.html';
      }else
      if(data['status'] == 'suspended'){
        window.location.href = 'https://pedeja.pt/suspenso.html';
      }else
      if(data['status'] == 'overloaded'){
        window.location.href = 'https://pedeja.pt/sobrecarregado.html';
      }else
      if(data['status'] == 'notfound'){
        window.location.href = 'https://pedeja.pt/indisponivel.html';
      }else
      if(data['status'] == 'error'){
        window.location.href = 'https://pedeja.pt/404.html';
      }else
      {
        window.location.href = 'https://pedeja.pt/404.html';
      }
      
    }

  }
  hr.send(vars);      
}

function print(data) {
  
  $('#nome').html(data.name);
  $('#caparest').attr('src','https://pedeja.pt/assets/img/pics/'+estab+'/bg.png');
  let categorias = data.menu[0].categorias;
  for (let i = 0; i < categorias.length; i++) {
    require.push([]);
    let cat = categorias[i].name;
    let catfilter = (cat.toLowerCase()).replace(/\s+/g, '');
    $('#tags-menu').append(`
    <button class="button todos inline-icon "  onclick="filterSelection('${catfilter}') " >${cat}</button>
    `);
    $('#produtos').append(`
    <div class="categoria row col-12 filterDiv ${catfilter} show">
      <h5 class="cat">${cat}</h5>   
    </div>`);
    let produtos = categorias[i].produtos;
    
    for (let p = 0; p < produtos.length; p++) {
      let produto = produtos[p];
      require[i].push([]);
      
      
      
      
      if( ( i == 0 && p == 0 ) || ( i == 1 && p == 0 )  || ( i == 2 && p == 6 ) || ( i == 0 && p == 1 ) || ( i == 0 && p == 2 )  || ( i == 1 && p == 1 ) || ( i == 1 && p == 2 ) || ( i == 6 && p == 2 ) || ( i == 0 && p == 16 ) || ( i == 0 && p == 15 ) || ( i == 0 && p == 14 ) || ( i == 1 && p == 14 ) || ( i == 1 && p == 15 ) || ( i == 1 && p == 16 ) || ( i == 4 && p == 9 )|| ( i == 4 && p == 8 ) )
      {}else{
          
          $('.'+catfilter).append(`
        <div class="col-12 col-md-4" data-bs-toggle="modal" data-bs-target="#modal${i}${p}">
          <div class="card" >
            <div class="row g-0">
              <div class=" info">
                <div class="card-body">
                  <h5 class="card-title">${produto.nome}</h5>
                  <p class="card-text">${produto.descricao}</p>
                  <p class="card-text"><small class="text-muted">${produto.preco}€</small></p>
                </div>
              </div>
              <div class=" img">
                <img src="https://pedeja.pt/assets/img/pics/${data.estab}/${i}/${p}.png" >
              </div>
            </div>
          </div>
        </div>
      `);
      }
      
      
      
      $('body').append(`
        <div class="modal fade popcomp" id="modal${i}${p}" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="staticBackdropLabel" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <from id="formmodal${i}${p}" clas="col-12" style="width:100%;">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title" id="staticBackdropLabel">${produto.nome}</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                  <div id="inmbv${i}${p}"></div>
                  <div id="inmbc${i}${p}"></div>
                  <div id="inmbe${i}${p}"></div>
                  <div class="pronote row col-12">
                    <div class="col-12 row "><div class="row pronote-in"><textarea class="col" id="nota${i}${p}" maxlength="200"  name="nota${i}${p}" placeholder="Nota" type="text" rows="1"></textarea></div></div>
                  </div>
                </div>
                <div class="modal-footer col-12 row">
              
                  <div class="col-6 increment" style="text-align:center; margin:0 !important;">
                    <div class="number-input col-12 row ">
                      <button onclick="this.parentNode.querySelector('input[type=number]').stepDown()" class="minus btn  btn-sm col-4"><i class="fas fa-minus"></i></button>
                      <input class="quantity col-4" min="1" readonly  max="99" id="quantity${i}${p}" name="quantity${i}${p}" value="1" type="number">
                      <button onclick="this.parentNode.querySelector('input[type=number]').stepUp()" class="plus btn  btn-sm col-4"><i class="fas fa-plus"></i></button>
                    </div>
                  </div>
                
                  <div class="col-6 " style="text-align:center; margin:0 !important;"><button type="button" class=" col-12 btn btn-sm btn-danger"  onclick="getValues(${i},${p})">Adicionar</button></div>
                </div>
              </div> 
            </from>
          </div>
        </div>
      `)
    
      if (produto.hasOwnProperty('variantes')==true) {
        var variantes = produto.variantes;
        for (var v = 0; v < variantes.length; v++) {
          require[i][p].push('vo'+i+''+p+''+v);
        var variante = variantes[v];
        $('#inmbv'+i+p).append(` 
        <div class="choisevariante col-12 col-12 row" id="variante${i}${p}${v}">
        <h5>${variante.nome}</h5>
        
        </div>
        `);
        
          for (let vo = 0; vo < variantes[v].opcoes.length; vo++) {
            let optionv = variantes[v].opcoes[vo];
            if (vo == 0) {
              
              $('#variante'+i+p+v).append(` 
              <div class="line row col-12">
              <div class="form-check col-4">
              <input class="form-check-input default" type="radio" value="${v}${vo}"   name="vo${i}${p}${v}" id="vo${i}${p}${vo}" checked >
              <label class="form-check-label" for="vo${i}${p}${vo}">
              ${optionv.nome}
              </label>
              </div>
              <div class="col-4 price">
              </div>
              </div>
              `);
             
            }else{
              if (optionv.preco == 0 || optionv.preco == '') {
                $('#variante'+i+p+v).append(` 
                <div class="line row col-12">
                <div class="form-check col-4">
                <input class="form-check-input" type="radio" value="${v}${vo}"   name="vo${i}${p}${v}" id="vo${i}${p}${vo}">
                <label class="form-check-label" for="vo${i}${p}${vo}">
                ${optionv.nome}
                </label>
                </div>
                <div class="col-4 price">
                <span></span>
                </div>
                </div>
                `);
              } else {
                $('#variante'+i+p+v).append(` 
                <div class="line row col-12">
                <div class="form-check col-4">
                <input class="form-check-input" type="radio" value="${v}${vo}"   name="vo${i}${p}${v}" id="vo${i}${p}${vo}">
                <label class="form-check-label" for="vo${i}${p}${vo}">
                ${optionv.nome}
                </label>
                </div>
                <div class="col-4 price">
                <span>+${optionv.preco}€</span>
                </div>
                </div>
                `);
              }
             
            }
          }
        }
      }
      
      if (produto.hasOwnProperty('complementos')==true) {
        var complementos = produto.complementos;
        for (var c = 0; c < complementos.length; c++) {
          require[i][p].push('co'+i+''+p+''+c);
        var complemento = complementos[c];
          $('#inmbc'+i+p).append(` 
            <div class="choise col-12" id="complemento${i}${p}${c}">
              <h5>${complemento.nome}</h5>
              
            </div>
          `);
          
            
            for (let co = 0; co < complemento.opcoes.length; co++) {
              let optionc = complementos[c].opcoes[co];
              
              $('#complemento'+i+p+c).append(` 
                <div class="form-check">
                  <input class="form-check-input" type="radio" value="${c}${co}"  name="co${i}${p}${c}" id="co${i}${p}${c}${co}">
                  <label class="form-check-label" for="co${i}${p}${c}${co}">
                    ${optionc}
                  </label>
                </div>
            `);
            }
            
        }
      }
     
      if (produto.hasOwnProperty('extras')==true) {
        var extras = produto.extras;
        for (var e = 0; e < extras.length; e++) {
          var extra = extras[e];
          $('#inmbe'+i+p).append(` 
          <div class="choiseextra col-12 col-12 row" id="extra${i}${p}${e}">
          <h5>${extra.nome}</h5>
          
          </div>
          `);
        
          for (let eo = 0; eo < extra.opcoes.length; eo++) {
            let optione = extra.opcoes[eo];

            if (optione.preco == 0 || optione.preco == '') {
              $('#extra'+i+p+e).append(` 
              <div class="line row col-12">
              <div class="form-check col-4">
                <input class="form-check-input" type="checkbox"  value="${e}${eo}"  name="eo${i}${p}${eo}" id="eo${i}${p}${e}${eo}">
                <label class="form-check-label" for="eo${i}${p}${e}${eo}">
                  ${optione.nome}
                </label>
              </div>
              <div class="col-4 price">
                <span></span>
              </div>
              <div class="col-4 increment">
                <div class="number-input col-12 row ">
                  <button onclick="this.parentNode.querySelector('input[type=number]').stepDown()" class="minus btn  btn-sm col-4"><i class="fas fa-minus"></i></button>
                  <input class="quantity col-4" min="1" readonly max="3" name="eoq${i}${p}${e}${eo}" id="eoq${i}${p}${e}${eo}" value="1" type="number">
                  <button onclick="this.parentNode.querySelector('input[type=number]').stepUp()" class="plus btn  btn-sm col-4"><i class="fas fa-plus"></i></button>
                </div>
              </div>
            </div>
          `);
            }else{

            
            $('#extra'+i+p+e).append(` 
              <div class="line row col-12">
              <div class="form-check col-4">
                <input class="form-check-input" type="checkbox"  value="${e}${eo}"  name="eo${i}${p}${eo}" id="eo${i}${p}${e}${eo}">
                <label class="form-check-label" for="eo${i}${p}${e}${eo}">
                  ${optione.nome}
                </label>
              </div>
              <div class="col-4 price">
                <span>+${optione.preco}€</span>
              </div>
              <div class="col-4 increment">
                <div class="number-input col-12 row ">
                  <button onclick="this.parentNode.querySelector('input[type=number]').stepDown()" class="minus btn  btn-sm col-4"><i class="fas fa-minus"></i></button>
                  <input class="quantity col-4" min="1" readonly max="3" name="eoq${i}${p}${e}${eo}" id="eoq${i}${p}${e}${eo}" value="1" type="number">
                  <button onclick="this.parentNode.querySelector('input[type=number]').stepUp()" class="plus btn  btn-sm col-4"><i class="fas fa-plus"></i></button>
                </div>
              </div>
            </div>
          `);
        }
      
            if (optione.hasOwnProperty('more')==true) {
              let id=i +''+ p +''+ e;
            
              
              $('#extra'+id+' .line').append(`<div class="more col-6" id="more${i}${p}${e}"></div>`);

              $('#eo'+id+''+eo).change(function() {

                if ($('#eo'+id+''+eo).prop("checked")==true) {

                  $('#more'+id).show();

                }else{
                  $('#more'+id).hide();
                  $('#more'+id+' input[type="radio"]').prop('checked',false);
                }
                
              });

              
              for (let eom = 0; eom < optione.more.length; eom++) {
                
                let more = optione.more[eom];
                $('#extra'+id+' .line .more').append(` 
                    <div class="form-check">
                      <input class="form-check-input" type="radio" value="${e}${eo}${eom}" name="eom${i}${p}${e}${eo}" id="eom${i}${p}${e}${eo}${eom}">
                      <label class="form-check-label" for="eom${i}${p}${e}${eo}${eom}">
                        ${more}
                      </label>
                    </div>
                `);
              }
              $('#more'+id).hide();
              
            }
          }
          
        }
      }

      
      
    }  
  }
}

function remove(el,id) {
  cpro--;
$('#tab2 button span').text(cpro);
  var element = el;
  element.remove();
  orderItem[id] = null;
  itemval[id] = 0;
  subcost=itemval.reduce(reducer);
  
  $('#subtotal').text(subcost.toFixed(2)+'€');
  $('#total').text((subcost+tx).toFixed(2)+'€');
  $('#no_cart').remove();
  if (subcost == 0) {
    $('.cartlist').append(`<span class="col-12 infotxtcart" style="text-align: center; margin: 10px auto 0px; display:block;" id="no_cart">Sem produtos!</span>`);
  
  }
  Swal.fire({
    position: 'top-end',
    icon: 'error',
    title: 'Produto removido!',
    showConfirmButton: false,
    timer: 1000
  })

}

function getValues(cat,pro) {
  
  let req = require[cat][pro].length;
  if (req > 0) {
    let ck=0;
    for (let num = 0; num < req; num++) {
        let inp = $('input[name="'+require[cat][pro][num]+'"]:checked').val();
   
      if (inp == '' ||  inp == null || inp == undefined) {
        ck++;
      }
      
    }
    if (ck == 0) {
      aceptsend(cat,pro);
    }else{
      $("#app").css("-webkit-filter","blur(2px)");
        $("#app").css("pointer-events","none");
      
    Swal.fire({
      title: 'Opções por selecionar!',
      text: "Existem variantes e complementos incluídos neste produto onde é necessário indicar quais os da sua preferência.",
      icon: 'warning',
      confirmButtonColor: '#3085d6',
      confirmButtonText: 'OK',
      allowOutsideClick: false
      }).then((result) => {
        if (result.isConfirmed) {
          $("#app").css("-webkit-filter","blur(0px)");
          $("#app").css("pointer-events","auto");
        }
      })
    }
    ck=0;
  }else{
    aceptsend(cat,pro);
  }

}

function aceptsend(cat,pro) {
 

  $("#modal"+cat+''+pro).modal('hide');

  var xv,xc,xe,yv,yc,ye;
  var addOnsArr = [];
  st=0;
	
  let qq = $('#quantity'+cat+''+pro).val();
  if (qq < 1 || qq > 99 ) {
    qq=1;
  }
  
  if (isNaN(qq)) 
  {
    qq=1;
    return false;
  }
  st+= parseFloat(data.menu[0].categorias[cat].produtos[pro].preco)*qq;
  $('.cartlist').append(`
  <div class="produto  col-12 row" id="p${cat}${pro}${count}">
    <div class="prin col-12 row">
      <div class="col-3 rem row"><span class="col-6"><i class="fas fa-times" onclick="remove(p${cat}${pro}${count},${count})"></i></span><span class="col-6">${qq}x</span></div>
      <div class="col-6 nam">${data.menu[0].categorias[cat].produtos[pro].nome}</div>
      <div class="col-3 pri"><span>${data.menu[0].categorias[cat].produtos[pro].preco}€</span></div>  
    </div>
  </div>
`);
cpro++;
$('#tab2 button span').text(cpro);
  var sel_variantes = new Array();
  $('#inmbv'+cat+''+pro+' input:checked').each(function() {
    sel_variantes.push(this.value);
    
  });

  var sel_complementos = new Array();
  $('#inmbc'+cat+''+pro+' input:checked').each(function() {
    sel_complementos.push(this.value);
  });


  var sel_extras = new Array();
  $('#inmbe'+cat+''+pro+' input:checked').each(function() {
    sel_extras.push(this.value);
  });

  for (let p = 0; p < sel_variantes.length; p++) {
    yv = Object.assign([], sel_variantes[p])
    xv = data.menu[0].categorias[cat].produtos[pro].variantes[yv[0]].opcoes[yv[1]];

    if (xv.preco=='' || xv.preco==0) {
      $('#p'+cat+''+pro+''+count).append(`
        <div class="det col-12 row">
        <div class="col-3 rem row"><span class="col-6"></span><span class="col-6"></span></div>
        <div class="col-6 nam"><span>${xv.nome}</span></div>
        <div class="col-3 pri"><span></span></div>  
        </div>
      `);
      addOnsArr.push(xv.nome);
    } else {
      $('#p'+cat+''+pro+''+count).append(`
        <div class="det col-12 row">
        <div class="col-3 rem row"><span class="col-6"></span><span class="col-6"></span></div>
        <div class="col-6 nam"><span>${xv.nome}</span></div>
        <div class="col-3 pri"><span>+${xv.preco}€</span></div>  
        </div>
      `);
      st+= parseFloat(xv.preco)*qq;
      addOnsArr.push(xv.nome+'   +€'+xv.preco);
    }
  }

  for (let p = 0; p < sel_complementos.length; p++) {
    yc = Object.assign([], sel_complementos[p])
    xc = data.menu[0].categorias[cat].produtos[pro].complementos[yc[0]].opcoes[yc[1]];

    $('#p'+cat+''+pro+''+count).append(`
      <div class="det col-12 row">
      <div class="col-3 rem row"><span class="col-6"></span><span class="col-6"></span></div>
      <div class="col-6 nam"><span>${xc}</span></div>
      <div class="col-3 pri"><span></span></div>  
      </div>
    `);
    addOnsArr.push(xc);
  }

  for (let p = 0; p < sel_extras.length; p++) {
    ye = Object.assign([], sel_extras[p])

    if (ye.length==3) {
      xe = data.menu[0].categorias[cat].produtos[pro].extras[ye[0]].opcoes[ye[1]].more[ye[2]];
      $('#p'+cat+''+pro+''+count).append(`
        <div class="det col-12 row">
        <div class="col-3 rem row"><span class="col-6"></span><span class="col-6"></span></div>
        <div class="col-6 nam"><span>${xe}</span></div>
        <div class="col-3 pri"><span></span></div>  
        </div>
      `);
      addOnsArr.push('   '+xe+' (incluído no extra)');
    }else{
      xe = data.menu[0].categorias[cat].produtos[pro].extras[ye[0]].opcoes[ye[1]];

      let qqq = $('#eoq'+cat+''+pro+''+ye[0]+''+ye[1]).val();
        if (qqq < 1 || qqq > 3 ) {
          qqq=1;
        }
        
        if (isNaN(qqq)) 
        {
          qqq=1;
          return false;
        }

      $('#p'+cat+''+pro+''+count).append(`
      <div class="det col-12 row">
      <div class="col-3 rem row"><span class="col-6"></span><span class="col-6">${qqq}x</span></div>
      <div class="col-6 nam"><span>${xe.nome}</span></div>
      <div class="col-3 pri"><span>+${xe.preco}€</span></div>  
      </div>
      `);
      st+= (parseFloat(xe.preco)*qqq*qq);
      addOnsArr.push((qqq)+'x '+xe.nome+' (extra)   +€'+xe.preco);
    }
  }

  if ($('#nota'+cat+''+pro).val() != '') {
    
    $('#p'+cat+''+pro+''+count).append(`
    <div class="ins col-12 row"><span>${$('#nota'+cat+''+pro).val()}</span></div>
    `);
  }

  
  var item = {quantity:qq,name:data.menu[0].categorias[cat].produtos[pro].nome,unitPrice:data.menu[0].categorias[cat].produtos[pro].preco,addOns:addOnsArr,detail:$('#nota'+cat+''+pro).val()};
	orderItem.push(item);
  itemval.push(st);
  
  count++;
  subcost+=st;
  
  $('#subtotal').text(subcost.toFixed(2)+'€');
  $('#total').text((subcost+tx).toFixed(2)+'€');


  $('#no_cart').hide();
  Swal.fire({
    position: 'top-end',
    icon: 'success',
    title: 'Produto adicionado!',
    showConfirmButton: false,
    timer: 1000
  })

resetForm($('#formmodal'+cat+''+pro)); 


  
}

function resetForm($form) {
  $form.find('input[type="number"]').val(1);
  $form.find('input[type="checkbox"]').prop('checked',false);
  $form.find('input[type="radio"]').prop('checked',false);
  $form.find('input[type="radio"].default').prop('checked',true);
  $form.find('textarea').val('');
  $form.find('.more').hide();
}

function printime(times,diadasemana) {

  $('.listar #date select').append(`
  <option class="0" value="dia" selected disabled hidden >Escolha o dia</option>
  `);

  datah = new Date().toLocaleString("en-US", {timeZone: "Europe/Lisbon"});
  datah = new Date(datah);
  diadasemana = datah.getDay();
  datahoje = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-'+datah.getDate();
  if ((datah.getMonth()+1) < 10 && datah.getDate() < 10) {
    datahoje = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-0'+datah.getDate();
  }else{
    if ((datah.getMonth()+1) < 10) {
      datahoje = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-'+datah.getDate();
    }
    if (datah.getDate() < 10) {
      datahoje = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-0'+datah.getDate();
    }
  }
   
  hoje = datah.getDate();
  if (datah.getHours() < 10 && datah.getMinutes() < 10) {
    horahoje = '0'+datah.getHours()+':0'+datah.getMinutes();
  }else{
    if (datah.getHours() < 10) {
      horahoje = '0'+datah.getHours()+':'+datah.getMinutes();
      
    }
    if (datah.getMinutes() < 10) {
      horahoje = datah.getHours()+':0'+datah.getMinutes();
    }
  }
  let conte = diadasemana;
  var index1=0;
  var conte1 = 0;
  var tomorrow;
  var dii=0;
  var index = 0;
   datadis = datahoje;
   
  if (conte < 7) {
    if (times[0][conte].status == 200) {
      for ( index1=index1; index1 < 1; index1++) {
        if (conte1 < 7) {
            
          if (times[0][conte].dias[conte1].status == 200) {
          
            tomorrow = new Date();
            tomorrow.setDate(new Date().getDate()+index+dii);
 
            if ((tomorrow.getMonth()+1) < 10 && tomorrow.getDate() < 10) {
                
              datadis = tomorrow.getFullYear()+'-0'+(tomorrow.getMonth()+1)+'-0'+tomorrow.getDate();
            }else{
              if ((tomorrow.getMonth()+1) < 10) {
                datadis = tomorrow.getFullYear()+'-0'+(tomorrow.getMonth()+1)+'-'+tomorrow.getDate();
                
              }
              if (tomorrow.getDate() < 10) {
                datadis = tomorrow.getFullYear()+'-'+(tomorrow.getMonth()+1)+'-0'+tomorrow.getDate();
                 
              }
            }
            
              $('.listar #date select').append(`
              <option id="${conte1}" value="${datadis}">${datadis}</option>
            `);
            
          }
          conte1++;
        }
        else{
          conte1 = 0;
          if (times[0][conte].dias[conte1].status == 200) {
            tomorrow = new Date();
            tomorrow.setDate(new Date().getDate()+index+dii);

            if ((tomorrow.getMonth()+1) < 10 && tomorrow.getDate() < 10) {
              datadis = tomorrow.getFullYear()+'-0'+(tomorrow.getMonth()+1)+'-0'+tomorrow.getDate();
            }else{
              if ((tomorrow.getMonth()+1) < 10) {
                datadis = tomorrow.getFullYear()+'-0'+(tomorrow.getMonth()+1)+'-'+tomorrow.getDate();
              }
              if (tomorrow.getDate() < 10) {
                datadis = tomorrow.getFullYear()+'-'+(tomorrow.getMonth()+1)+'-0'+tomorrow.getDate();
              }
            }
            
              $('.listar #date select #1').append(`
              <option id="${conte1}" value="${datadis}">${datadis}</option>
            `);
            
            
          }
          conte1 = 1;
        }
        dii++;
      }
      dii=0;
      index1=0;
    }else{
      alert('Não é possivel pedir para hoje!');
    }
    conte++;
  }

    datah = new Date().toLocaleString("en-US", {timeZone: "Europe/Lisbon"});
        datah = new Date(datah);
        let horas,minutos,segundos;
        if (datah.getHours() < 10){horas = '0'+datah.getHours();}else{horas = datah.getHours();}
        if (datah.getMinutes() < 10){minutos = '0'+datah.getMinutes();}else{minutos = datah.getMinutes();}
        if (datah.getSeconds() < 10){segundos = '0'+datah.getSeconds();}else{segundos = datah.getSeconds();}
        let horaatual = horas+':'+minutos+':'+segundos;
        
        if (horaatual < data['horai']  || horaatual > data['horaf']) {
          
          $('.listar #when select').append(`
      <option value="2" >Mais tarde</option>
    `);

       whn = $(this).children(":selected").val();
      
        $('#date').removeClass("ocul");
        $('#time').removeClass("ocul");
        $('.listar #time select').append(`
        <option class="0" value="hora" selected disabled hidden >Escolha a hora</option>
        `);
     
    
    $("#date select").change(function () {
      var id = $(this).children(":selected").attr("id");
      printh(times,diadasemana,id);
    });
    
        
        }else{
          $('.listar #when select').append(`
      <option value="1" >Agora</option>
      <option value="2" >Mais tarde</option>
    `);

    $("#when select").change(function () {
       whn = $(this).children(":selected").val();
      if (whn == 1) {
        $('#date').addClass("ocul");
        $('#time').addClass("ocul");

        today = new Date();
        today.setMinutes(today.getMinutes() + 30);

        
        if ((today.getHours()-1) < 10 && today.getMinutes() < 10) {
          todaym = '0'+(today.getHours()-1)+':0'+today.getMinutes()+':00';
        }else{
          if (today.getHours() < 10) {
            todaym = '0'+(today.getHours()-1)+':'+today.getMinutes()+':00';
            
          }
          if (today.getMinutes() < 10) {
            todaym = (today.getHours()-1)+':0'+today.getMinutes()+':00';
          }
        }

        horadev = todaym;
        datadev = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-'+datah.getDate();
      }
      if (whn == 2) {
        $('#date').removeClass("ocul");
        $('#time').removeClass("ocul");
        $('.listar #time select').append(`
        <option class="0" value="hora" selected disabled hidden >Escolha a hora</option>
        `);
     }
    
    $("#date select").change(function () {
      var id = $(this).children(":selected").attr("id");
      printh(times,diadasemana,id);
    });
    });
        }
 
  
}

function printh(times,diadasemana,dia) {
  datah = new Date().toLocaleString("en-US", {timeZone: "Europe/Lisbon"});
  datah = new Date(datah);
  diadasemana = datah.getDay();
  datahoje = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-'+datah.getDate();
  if ((datah.getMonth()+1) < 10 && datah.getDate() < 10) {
    datahoje = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-0'+datah.getDate();
  }else{
    if ((datah.getMonth()+1) < 10) {
      datahoje = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-'+datah.getDate();
    }
    if (datah.getDate() < 10) {
      datahoje = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-0'+datah.getDate();
    }
  }
  hoje = datah.getDate();
  if (datah.getHours() < 10 && datah.getMinutes() < 10) {
    horahoje = '0'+datah.getHours()+':0'+datah.getMinutes();
  }else{
    if (datah.getHours() < 10) {
      horahoje = '0'+datah.getHours()+':'+datah.getMinutes();
      
    }
    if (datah.getMinutes() < 10) {
      horahoje = datah.getHours()+':0'+datah.getMinutes();
    }
  }

  var timesInBetween = [];
  $('#time select').empty();

  let daa = (parseInt(diadasemana)+parseInt(dia));
  if (daa >= 7) {
    let re = parseInt(diadasemana) + parseInt(dia);
    daa= re - 7;
  }

  let fromtime = times[0][diadasemana].dias[daa].horas[0];
  let totime = times[0][diadasemana].dias[daa].horas[1];
  let getGenTime = (timeString) => {
    let H = +timeString.substr(0, 2);
    let h = (H % 12) || 12;
    let ampm = H < 12 ? " AM" : " PM";
    return timeString = h + timeString.substr(2, 3) + ampm;
  }
  function returnTimesInBetween(start, end) {
    var startH = parseInt(start.split(":")[0]);
    var startM = parseInt(start.split(":")[1]);
    var endH = parseInt(end.split(":")[0]);
    var endM = parseInt(end.split(":")[1]);
    if (startM == 30)
      startH++;
    for (var i = startH; i < endH; i++) {
      timesInBetween.push(i < 10 ? "0" + i + ":00" : i + ":00");
      timesInBetween.push(i < 10 ? "0" + i + ":30" : i + ":30");
    }
    timesInBetween.push(endH + ":00");
    if (endM == 30)
      timesInBetween.push(endH + ":30")
    return timesInBetween.map(getGenTime);
  }

  returnTimesInBetween(fromtime, totime);

  showtimes(timesInBetween,dia);
}

function showtimes(timesInBetween,dia) {
  datah = new Date().toLocaleString("en-US", {timeZone: "Europe/Lisbon"});
  datah = new Date(datah);
  diadasemana = datah.getDay();
  datahoje = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-'+datah.getDate();
  if ((datah.getMonth()+1) < 10 && datah.getDate() < 10) {
    datahoje = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-0'+datah.getDate();
  }else{
    if ((datah.getMonth()+1) < 10) {
      datahoje = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-'+datah.getDate();
    }
    if (datah.getDate() < 10) {
      datahoje = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-0'+datah.getDate();
    }
  }
  hoje = datah.getDate();
  horahoje = datah.getHours()+':'+datah.getMinutes();
  if (datah.getHours() < 10 && datah.getMinutes() < 10) {
    horahoje = '0'+datah.getHours()+':0'+datah.getMinutes();
  }else{
    if (datah.getHours() < 10) {
      horahoje = '0'+datah.getHours()+':'+datah.getMinutes();
      
    }
    if (datah.getMinutes() < 10) {
      horahoje = datah.getHours()+':0'+datah.getMinutes();
    }
  }

  let disa=0;
  $('.listar #time select').append(`
  <option class="0" value="hora" selected disabled hidden >Escolha a hora</option>
  `);

  if (dia == 0) {

    for ( let o = 0; o < timesInBetween.length; o++) {
     
      if ( timesInBetween[o] > horahoje && o != (timesInBetween.length)) {
        if (disa == 0) {
         
          disa=1;
        }else{
        $('.listar #time select').append(`
        <option class="${dia}" value="${timesInBetween[o]}" >${timesInBetween[o]}</option>
        `);
        }
      }
    }
    
  }else{

    for ( let o = 0; o < timesInBetween.length; o++) {
        $('.listar #time select').append(`
        <option class="${dia}" value="${timesInBetween[o]}">${timesInBetween[o]}</option>
        `);
      }
      
  }

  datadev = $("#date select").children(":selected").val();
  horadev = '';
  
  $("#time select").change(function () {
   horadev = $(this).children(":selected").val()+':00';
    d = new Date(datadev+'T'+horadev);
    horadev = (d.getHours()-1)+':'+d.getMinutes()+':00';
  if ((d.getHours()-1) < 10 && d.getMinutes() < 10) {
    horadev = '0'+(d.getHours()-1)+':0'+d.getMinutes()+':00';
  }else{
    if ((d.getHours()-1) < 10) {
      horadev = '0'+(d.getHours()-1)+':'+d.getMinutes()+':00';
      
    }
    if (d.getMinutes() < 10) {
      horadev = (d.getHours()-1)+':0'+d.getMinutes()+':00';
    }
  }

  });
}

$('#adre_info').click(function () {
   info_nome = $('#info_nome').val();
   info_contato = $('#info_contato').val();
   info_email = $('#info_email').val();
   info_rua = $('#info_rua').val();
   info_porta = $('#info_porta').val();
   info_freguesia = $('#info_freguesia').val();
   info_postal = $('#info_postal').val();
   info_cidade = $('#info_cidade').val();

   
  if (info_nome==''||info_contato==''||info_email==''||info_rua==''||info_porta==''||info_freguesia==''||info_postal==''||info_cidade=='' || info_contato.length != 9) {
    pmvali='poc';
  

    Swal.fire({
      title: 'Dados em falta ou incorretos!',
      text: "Deve preencher todos os dados de entrega corretamente!",
      icon: 'warning',
      confirmButtonColor: '#3085d6',
      confirmButtonText: 'OK',
      allowOutsideClick: false
    }).then((result) => {
      if (result.isConfirmed) {
        $("#app").css("-webkit-filter","blur(0px)");
        $("#app").css("pointer-events","auto");
      }
    })

    $("#flush-headingTwo").click();
  }else{
 
    var myLatLng;
    var geocoder = new google.maps.Geocoder();
   
    geocoder.geocode({ address: info_rua+' '+info_porta+' '+info_freguesia+' '+info_postal+' '+info_cidade+' Portugal'}, function (results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          
            var latitude = results[0].geometry.location.lat();
            var longitude = results[0].geometry.location.lng();
        }
        myLatLng = { lat: latitude, lng: longitude };
        
        var city;
        geocoder.geocode({ address: adre +' Portugal'}, async function (results, status) {
            if (status == google.maps.GeocoderStatus.OK) {
                var latitude = results[0].geometry.location.lat();
                var longitude = results[0].geometry.location.lng();
            }
            city = { lat: latitude, lng: longitude };
            var rad = function (x) {
                return (x * Math.PI) / 180;
            };
            var getDistance = function (p1, p2) {
                var R = 6378137;
                var dLat = rad(p2.lat - p1.lat);
                var dLong = rad(p2.lng - p1.lng);
                var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(p1.lat)) * Math.cos(rad(p2.lat)) * Math.sin(dLong / 2) * Math.sin(dLong / 2);
                var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                var d = R * c;
                return d;
            };
            var km = getDistance(myLatLng, city) / 1000;
            let zona;
            km.toFixed(2)
           if (km<=4) {tx=2.8;outline=true;zona=1;} else 
           if (km<=8.5) {tx=5;outline=true;zona=2;} else 
           {tx=0; outline=false;}

           if(tx > 0 ){
            $("#app").css("-webkit-filter","blur(2px)");
            $("#app").css("pointer-events","none");
            Swal.fire({
              title: 'Zona '+zona+'!',
              text: "Foi adicionada ao pedido a taxa de entrega de "+tx.toFixed(2)+"€. Verifique sempre se preencheu os campos com a informação correta.",
              icon: 'success',
              confirmButtonColor: '#3085d6',
              confirmButtonText: 'OK',
              allowOutsideClick: false
            }).then((result) => {
              if (result.isConfirmed) {
                $("#app").css("-webkit-filter","blur(0px)");
                $("#app").css("pointer-events","auto");
              }
            })
           }
           
           $('#taxadeentrega').text(tx.toFixed(2)+'€');
           $('#total').text((subcost+tx).toFixed(2)+'€');
        });
    });
    $('#no_info').hide();
    $('#info').append(`
        <span class="col-12 infotxt" id="nome_print"></span>
        <span class="col-12 infotxt" id="morada_print"></span>
        <span class="col-12 infotxt" id="contato_print"></span>
        <span class="col-12 infotxt" id="email_print"></span>
    `);
    $('#nome_print').html(info_nome);
    $('#morada_print').html(info_rua+' '+info_porta+' '+info_freguesia+' '+info_postal+' '+info_cidade);
    
    $('#contato_print').html(info_contato);
    $('#email_print').html(info_email);
    $("#infodelivery .btn-close").click();
    pmvali=per;
  }
});


$('.cartfooter').click(function () {

  
  
  $("#app").css("-webkit-filter","blur(2px)");
  $("#app").css("pointer-events","none");
  whn=$('#when select').val();
if (whn == 1) {

        today = new Date();
        today.setMinutes(today.getMinutes() + 30);

        todaym = (today.getHours()-1)+':'+today.getMinutes()+':00';
        if ((today.getHours()-1) < 10 && today.getMinutes() < 10) {
          todaym = '0'+(today.getHours()-1)+':0'+today.getMinutes()+':00';
        }else{
          if (today.getHours() < 10) {
            todaym = '0'+(today.getHours()-1)+':'+today.getMinutes()+':00';
            
          }
          if (today.getMinutes() < 10) {
            todaym = (today.getHours()-1)+':0'+today.getMinutes()+':00';
          }
        }
        horadev = todaym;


  if ((datah.getMonth()+1) < 10 && datah.getDate() < 10) {
    datadev = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-0'+datah.getDate();
  }else{
    if ((datah.getMonth()+1) < 10) {
      datadev = datah.getFullYear()+'-0'+(datah.getMonth()+1)+'-'+datah.getDate();
    }
    if (datah.getDate() < 10) {
      datadev = datah.getFullYear()+'-'+(datah.getMonth()+1)+'-0'+datah.getDate();
    }
  }
  
   senddd();
}else{
  if ($('#date select').val()== null || $('#time select').val()== null) {
 

    Swal.fire({
      title: 'Ecolha uma hora e uma data!',
      text: "É necessário escolher uma hora e data válida!",
      icon: 'warning',
      confirmButtonColor: '#3085d6',
      confirmButtonText: 'OK',
      allowOutsideClick: false
    }).then((result) => {
      if (result.isConfirmed) {
        $("#app").css("-webkit-filter","blur(0px)");
        $("#app").css("pointer-events","auto");
      }
    })

  }else{

    if (datadev == datahoje) {


      today = new Date();
      today.setMinutes(today.getMinutes() + 30);

      let horas,minutos,segundos;
      if ((today.getHours()-1) < 10){horas = '0'+(today.getHours()-1);}else{horas = (today.getHours()-1);}
      if (today.getMinutes() < 10){minutos = '0'+today.getMinutes();}else{minutos = today.getMinutes();}
      if (today.getSeconds() < 10){segundos = '0'+today.getSeconds();}else{segundos = today.getSeconds();}
      let todaym = horas+':'+minutos+':'+segundos;
      



      if (horadev >= todaym) {
        senddd();
      }else{

        Swal.fire({
          title: 'Horário indisponível!',
          text: "Já não é possível efetuar o pedido para o horário escolhido!",
          icon: 'warning',
          confirmButtonColor: '#3085d6',
          confirmButtonText: 'OK',
          allowOutsideClick: false
        }).then((result) => {
          if (result.isConfirmed) {
            $("#app").css("-webkit-filter","blur(0px)");
            $("#app").css("pointer-events","auto");
          }
        })
      
      }

    }else{
      
      senddd();
    }
  }

}
 
  
function senddd() {
  if (outline==false) {
    Swal.fire({
      title: 'Fora da zona de entrega!',
      text: "A morada indicada excede a nossa zona máxima de entregas.",
      icon: 'warning',
      footer: '<a href="estabelecimento.html?type='+type+'&city='+city+'&estab='+estab+'">Recarregar página e tentar novamente.</a>',
      confirmButtonColor: '#3085d6',
      confirmButtonText: 'Rever pedido',
      allowOutsideClick: false
    }).then((result) => {
      if (result.isConfirmed) {
        $("#app").css("-webkit-filter","blur(0px)");
        $("#app").css("pointer-events","auto");
      }
    })
  }else{
  if (pmvali == per && (subcost+1000)/1 != 1000)  {
    info_pay = $('#pay select').val();
    info_instru = $('#noteall #code').val();
    
    var settings = {
      "url": "https://api.shipday.com/orders",
      "method": "POST",
      "timeout": 0,
      "headers": {
        "Authorization": "Basic "+re+"."+ri,
        "Content-Type": "application/json"
      },
      "data": JSON.stringify({
        "orderNumber": nuor,
        "customerName": info_nome,
        "customerAddress": info_rua+' '+info_porta+' '+info_freguesia+' '+info_postal+' '+info_cidade,
        "customerEmail": info_email,
        "customerPhoneNumber": info_contato,
        "restaurantName": nam,
        "restaurantAddress": adre,
        "restaurantPhoneNumber": cont,
        "orderItem": JSON.stringify(orderItem),
        "totalOrderCost": subcost+tx,
        "tax": ((tx*0.23) + (subcost*0.13)).toFixed(2),
        "tips": "0",
        "deliveryFee": tx,
        "paymentMethod": info_pay,
        "deliveryInstruction": info_instru,
        "expectedDeliveryDate": datadev,
        "expectedDeliveryTime": horadev
      }),
    };

  Swal.fire({
    title: 'Enviar pedido?',
    text: "Pretende finalizar e enviar definitivamente o pedido? Pode sempre rever o pedido antes de enviar.",
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Enviar',
    cancelButtonText: 'Rever pedido'
  }).then((result) => {
    if (result.isConfirmed) {
      let timerInterval
      Swal.fire({
        title: 'Aguarde...',
        html: 'Estamos a processar o seu pedido!',
        timer: 2500,
        timerProgressBar: true,
        didOpen: () => {
          Swal.showLoading()
          timerInterval = setInterval(() => {
            const content = Swal.getHtmlContainer()
            if (content) {
              const b = content.querySelector('b')
              if (b) {
                b.textContent = Swal.getTimerLeft()
              }
            }
          }, 100)
        },
        willClose: () => {
          clearInterval(timerInterval)
        }
      });
      $.ajax(settings).done(function (response) {
       
        if (response.success==true) {

         
          
          Swal.fire({
            title: 'Pedido enviado!',
            text: "O seu pedido foi enviado com sucesso! Estimamos que o seu pedido será entregue entre 25 a 50 minutos. Se por algum motivo o pedido não for aceite irá ser contactado.",
            icon: 'success',
            confirmButtonColor: '#3085d6',
            confirmButtonText: 'OK',
            allowOutsideClick: false
          }).then((result) => {
            if (result.isConfirmed) {
              window.location.replace('https://pedeja.pt/estabelecimentos.html?type='+type+'&city='+city);
            }
          });

          sendemail=info_email;
          sendname=nam;
          sendorder=nuor;
          senduser=info_nome;
          
          var hr = new XMLHttpRequest();
          var url = "https://pedeja.pt/api/phpmailer/send.php";
          var vars = "email="+sendemail+"&name="+sendname+"&order="+sendorder+"&user="+senduser;
          hr.open("POST", url, true);
          hr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
          hr.onreadystatechange = function() {
            if(hr.readyState == 4 && hr.status == 200) {
              var return_data = hr.responseText;
            }
          }
          hr.send(vars); 
        }else{
          Swal.fire({
            title: 'Não foi possível enviar o seu pedido!',
            text: "Algo não correu bem, verifique se todos os dados estão corretos, se o problema persistir recarregue a página.",
            icon: 'warning',
            footer: '<a href="estabelecimento.html?type='+type+'&city='+city+'&estab='+estab+'">Recarregar página e tentar novamente.</a>',
            confirmButtonColor: '#3085d6',
            confirmButtonText: 'Rever pedido',
            allowOutsideClick: false
          }).then((result) => {
            if (result.isConfirmed) {
              $("#app").css("-webkit-filter","blur(0px)");
              $("#app").css("pointer-events","auto");
            }
          })
        }




      });
    }else{
      $("#app").css("-webkit-filter","blur(0px)");
      $("#app").css("pointer-events","auto");
    }
  })   
    
    
   
  
    } else {
      if (subcost==0 ) {
        Swal.fire({
          title: 'Sem produtos!',
          text: "Deve escolher pelo menos um produto!",
          icon: 'warning',
          confirmButtonColor: '#3085d6',
          confirmButtonText: 'OK',
          allowOutsideClick: false
        }).then((result) => {
          if (result.isConfirmed) {
            $("#app").css("-webkit-filter","blur(0px)");
            $("#app").css("pointer-events","auto");
          }
        })
      } else {

        Swal.fire({
          title: 'Está quase!',
          text: "Informações de entrega incompletas ou inválidas!",
          icon: 'warning',
          confirmButtonColor: '#3085d6',
          confirmButtonText: 'OK',
          allowOutsideClick: false
        }).then((result) => {
          if (result.isConfirmed) {
            $("#app").css("-webkit-filter","blur(0px)");
            $("#app").css("pointer-events","auto");
          }
        })

      
      }
    } 
  }
}

  
});


slider.addEventListener("mousedown", e => {
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
slider.addEventListener("mousemove", e => {
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

function cls() {
  $('.categoria.boxs *').remove();
  $('.categoria.boxs').append(`
  <h5>Box's temporáriamente indisponível.<h5>
  `);
}

for (var i = 0; i < btns.length; i++) {
  btns[i].addEventListener("click", function() {
    var current = document.getElementsByClassName("active");
    current[0].className = current[0].className.replace(" active", "");
    this.className += " active";
  });
}

window.addEventListener( "pageshow", function ( event ) {
  var historyTraversal = event.persisted || 
                         ( typeof window.performance != "undefined" && 
                              window.performance.navigation.type === 2 );
  if ( historyTraversal ) {
    window.location.reload();
  }
});

function onlyNumberKey(evt) {
  var ASCIICode = (evt.which) ? evt.which : evt.keyCode
  if (ASCIICode > 31 && (ASCIICode < 48 || ASCIICode > 57))
      return false;
  return true;
}


