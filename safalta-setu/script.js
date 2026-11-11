"use strict";

const root = document.documentElement;
const themeToggle = document.querySelector(".theme-toggle");
const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-navigation");

function updateThemeControl() {
  const dark = root.dataset.theme === "dark";
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.setAttribute(
    "aria-label",
    dark ? "Use light mode" : "Use dark mode",
  );
  themeToggle.querySelector("[data-theme-label]").textContent = dark
    ? "Light mode"
    : "Dark mode";
  themeToggle.querySelector("[data-theme-icon]").textContent = dark
    ? "\u2600"
    : "\u263e";
}

function closeMenu(returnFocus) {
  navigation.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.querySelector("[data-menu-label]").textContent = "Menu";
  menuToggle.querySelector("[data-menu-icon]").textContent = "\u2630";
  if (returnFocus) menuToggle.focus();
}

updateThemeControl();
themeToggle.addEventListener("click", function () {
  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = theme;
  try {
    localStorage.setItem("safalta-theme", theme);
  } catch (error) {
    // Theme selection still works for the current page.
  }
  updateThemeControl();
});

window.addEventListener("storage", function (event) {
  if (
    event.key === "safalta-theme" &&
    (event.newValue === "light" || event.newValue === "dark")
  ) {
    root.dataset.theme = event.newValue;
    updateThemeControl();
  }
});

menuToggle.addEventListener("click", function () {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.querySelector("[data-menu-label]").textContent = open
    ? "Close"
    : "Menu";
  menuToggle.querySelector("[data-menu-icon]").textContent = open
    ? "\u00d7"
    : "\u2630";
  navigation.classList.toggle("is-open", open);
});

document.addEventListener("keydown", function (event) {
  if (
    event.key === "Escape" &&
    menuToggle.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu(true);
  }
});

navigation.addEventListener("click", function (event) {
  if (event.target.closest("a")) closeMenu(false);
});

document.addEventListener("click", function (event) {
  if (!event.target.closest(".site-header")) closeMenu(false);
});

window
  .matchMedia("(min-width: 1101px)")
  .addEventListener("change", function (event) {
    if (event.matches) closeMenu(false);
  });
