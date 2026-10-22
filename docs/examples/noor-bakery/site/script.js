// Noor Bakery: client-side contact form validation. Nothing is sent anywhere.
(function () {
  "use strict";

  var form = document.getElementById("contact-form");
  var thanks = document.getElementById("thank-you");
  var thanksName = document.getElementById("thank-you-name");
  var again = document.getElementById("send-another");
  var year = document.getElementById("year");

  if (year) year.textContent = String(new Date().getFullYear());
  if (!form || !thanks) return;

  // Practical email check: local@domain.tld, no spaces, a dot in the domain, TLD of 2+ letters.
  var EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

  function isValidEmail(value) {
    return EMAIL_RE.test(value.trim());
  }

  function setError(input, message) {
    var el = document.getElementById(input.id + "-error");
    if (el) el.textContent = message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function validateField(input) {
    var value = input.value.trim();
    if (input.id === "email") {
      if (!value) return setError(input, "Please enter your email address."), false;
      if (!isValidEmail(value)) return setError(input, "Please enter a valid email, e.g. name@example.com."), false;
    } else if (input.id === "name") {
      if (!value) return setError(input, "Please tell us your name."), false;
    } else if (input.id === "message") {
      if (!value) return setError(input, "Please write a short message."), false;
    }
    setError(input, "");
    return true;
  }

  var fields = [form.elements.name, form.elements.email, form.elements.message];

  fields.forEach(function (input) {
    // Validate when leaving a field, and re-validate live once an error is shown.
    input.addEventListener("blur", function () {
      if (input.value.trim()) validateField(input);
    });
    input.addEventListener("input", function () {
      if (input.getAttribute("aria-invalid") === "true") validateField(input);
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault(); // never submit anywhere

    var firstInvalid = null;
    fields.forEach(function (input) {
      if (!validateField(input) && !firstInvalid) firstInvalid = input;
    });

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    var name = form.elements.name.value.trim();
    thanksName.textContent = name ? ", " + name : "";
    form.hidden = true;
    thanks.hidden = false;
    thanks.focus();
    form.reset();
  });

  if (again) {
    again.addEventListener("click", function () {
      thanks.hidden = true;
      form.hidden = false;
      fields.forEach(function (input) { setError(input, ""); });
      form.elements.name.focus();
    });
  }

  // Exposed for automated checks only; harmless in production.
  window.__noorIsValidEmail = isValidEmail;
})();
