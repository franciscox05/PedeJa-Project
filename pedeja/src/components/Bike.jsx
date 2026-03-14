import "../css/components/Bike.css";


function Bike() {
  return (
    <div className="d-lg-flex d-none col-lg-3 col-xl-5 pt-5" id="div-left">
      <div id="base-left">
        <img id="moto" className="col-12" src={MotoGif} alt="Moto" />
      </div>
    </div>
  );
}

export default Bike;
