import "../css/components/LoginInterfaces.css";

function LoginRecuperarPass({ aoMudarVista }) {
  return (
    <div className="auth-form">
      <h2>Recuperar password</h2>
      <hr />
      <div>
        <form className="form" method="GET">
          <label htmlFor="username">Email ou Telemóvel:</label>
          <input
            id="username"
            type="text" 
            placeholder="Email ou Telemóvel"
          />
          
          <input type="submit" value="Recuperar" />
          
        </form>

        <div className="NaoTemConta">
          <p>
            Já tem conta?{" "}
            <strong onClick={() => aoMudarVista("login")}>
              Fazer Login
            </strong>
          </p>
        </div>
      </div>
    </div>
  );
}
export default LoginRecuperarPass;