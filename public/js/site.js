const navigationToggle = document.querySelector(".nav-toggle");
const navigation = document.getElementById("mainNavigation");

if (navigationToggle && navigation) {
    navigationToggle.addEventListener("click", function () {
        const expanded = this.getAttribute("aria-expanded") === "true";
        this.setAttribute("aria-expanded", String(!expanded));
        navigation.classList.toggle("show", !expanded);
    });
}
