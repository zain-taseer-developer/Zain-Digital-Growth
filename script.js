// Footer year
var y = document.getElementById("year");
if (y) y.textContent = new Date().getFullYear();

// Mobile menu
var burger = document.getElementById("burger");
var nav = document.getElementById("nav");
if (burger && nav) {
  burger.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", open);
  });
}

// Contact page: ?service=seo wagaira se dropdown pehle se select ho jata hai
var sel = document.getElementById("service");
if (sel) {
  var s = new URLSearchParams(window.location.search).get("service");
  if (s) sel.value = s;
}
