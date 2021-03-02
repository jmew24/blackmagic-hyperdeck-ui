let btnLogin = document.getElementById("btnLogin");
let user_name = document.getElementById("user_name");
let password = document.getElementById("password");
let error = document.getElementById("error");
let error_message = document.getElementById("error_message");
let error_exit = document.getElementById("error_exit");

btnLogin.onclick = () => {
  error.style.display = "none";
  error_message.innerHTML = "";

  let formData = new FormData();
  formData.append("user_name", user_name.value.trim());
  formData.append("password", password.value.trim());

  fetch("/login", {
    body: formData,
    method: "post",
  })
    .then((data) => {
      if (data.status !== 200) {
        console.error("Error:", data);
        error_message.innerHTML = data.statusText;
        error.style.display = "block";
      } else {
        window.location.replace("/");
      }
    })
    .catch((error) => {
      error_message.innerHTML = error;
      error.style.display = "block";
      console.error("Error:", error);
    });
};

error_exit.onclick = () => {
  error_message.innerHTML = "";
  error.style.display = "none";
};

// Initial control setup once the page is loaded
window.onload = () => {
  if (error_message.innerHTML.length == 0) error.style.display = "none";
};

window.onerror = function (error) {
  error_message.innerHTML = error;
  error.style.display = "block";
  console.error("Error:", error);
};
