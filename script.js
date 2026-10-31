// Footer year
var y = document.getElementById("year");
if (y) y.textContent = new Date().getFullYear();

// Site-wide back-to-top button
var backToTop = document.createElement("button");
backToTop.type = "button";
backToTop.className = "back-to-top";
backToTop.setAttribute("aria-label", "Back to top");
backToTop.textContent = "↑";
backToTop.hidden = true;
document.body.appendChild(backToTop);

function updateBackToTopVisibility() {
  backToTop.hidden = window.scrollY < 400;
}

window.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
updateBackToTopVisibility();

backToTop.addEventListener("click", function () {
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
});

// Site-wide search
var searchForm = document.getElementById("site-search-form");
if (searchForm) {
  var searchInput = document.getElementById("site-search");
  var resultsPanel = document.getElementById("site-search-results-panel");
  var searchStatus = document.getElementById("site-search-status");
  var searchResults = document.getElementById("site-search-results");

  var searchIndexPromise;

  function loadSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = fetch(new URL("sitemap.xml", document.baseURI))
        .then(function (response) {
          if (!response.ok) throw new Error("The site map could not be loaded.");
          return response.text();
        })
        .then(function (xml) {
          var sitemap = new DOMParser().parseFromString(xml, "application/xml");
          if (sitemap.querySelector("parsererror")) throw new Error("The site map is invalid.");

          var pageUrls = Array.from(sitemap.querySelectorAll("loc"))
            .map(function (location) {
              var url = new URL(location.textContent, window.location.href);
              var path = url.pathname.replace(/\/+$/, "");
              var filename = path.split("/").pop();
              if (!filename || filename.indexOf(".") === -1) {
                path = (path || "") + (filename ? ".html" : "/index.html");
              }
              return new URL(path, window.location.origin).href;
            });
          pageUrls = Array.from(new Set(pageUrls));

          return Promise.allSettled(pageUrls.map(function (url) {
            return fetch(url).then(function (response) {
              if (!response.ok) throw new Error("A page could not be loaded.");
              return response.text();
            }).then(function (html) {
              var page = new DOMParser().parseFromString(html, "text/html");
              var main = page.querySelector("main") || page.body;
              main.querySelectorAll("script, style, nav, header, footer").forEach(function (element) {
                element.remove();
              });
              var content = (main.textContent || "").replace(/\s+/g, " ").trim();
              var headings = Array.from(main.querySelectorAll("h1, h2, h3"))
                .map(function (heading) { return heading.textContent.trim(); })
                .filter(Boolean);

              return {
                title: page.querySelector("h1")?.textContent.trim() || page.title || "Website page",
                url: url,
                headings: headings.join(" "),
                content: content
              };
            });
          })).then(function (results) {
            var pages = results.filter(function (result) {
              return result.status === "fulfilled";
            }).map(function (result) { return result.value; });
            var failedCount = results.length - pages.length;
            if (!pages.length) throw new Error("No website pages could be indexed.");
            return { pages: pages, failedCount: failedCount };
          });
        });
    }
    return searchIndexPromise;
  }

  function renderSearchResults(query) {
    searchResults.replaceChildren();
    var pageResults = document.getElementById("search-page-results");
    var pageStatus = document.getElementById("search-page-status");
    if (pageResults) pageResults.replaceChildren();
    var terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      resultsPanel.hidden = true;
      if (pageStatus) pageStatus.textContent = "Enter a search term to find pages.";
      return;
    }

    resultsPanel.hidden = false;
    searchStatus.textContent = "Searching website pages…";
    if (pageStatus) pageStatus.textContent = "Searching website pages…";
    loadSearchIndex().then(function (index) {
      if (searchInput.value.trim() !== query.trim()) return;

      var matches = index.pages.map(function (page) {
        var searchable = (page.title + " " + page.headings + " " + page.content).toLowerCase();
        if (!terms.every(function (term) { return searchable.includes(term); })) return null;

        var score = terms.reduce(function (total, term) {
          return total + (page.title.toLowerCase().includes(term) ? 5 : 0) +
            (page.headings.toLowerCase().includes(term) ? 3 : 0);
        }, 0);
        return { page: page, score: score };
      }).filter(Boolean).sort(function (a, b) { return b.score - a.score; });

      function createResult(match) {
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = match.page.url;
        link.textContent = match.page.title;
        item.appendChild(link);

        var snippetSource = match.page.content;
        var position = snippetSource.toLowerCase().indexOf(terms[0]);
        if (position === -1) {
          snippetSource = match.page.headings || match.page.title;
          position = snippetSource.toLowerCase().indexOf(terms[0]);
        }
        var start = Math.max(0, position - 65);
        var snippet = snippetSource.slice(start, start + 180);
        var description = document.createElement("p");
        description.textContent = (start ? "…" : "") + snippet +
          (start + 180 < snippetSource.length ? "…" : "");
        item.appendChild(description);
        return item;
      }

      matches.slice(0, 10).forEach(function (match) {
        searchResults.appendChild(createResult(match));
      });
      if (pageResults) {
        matches.forEach(function (match) {
          pageResults.appendChild(createResult(match));
        });
      }

      var countMessage = matches.length
        ? matches.length + (matches.length === 1 ? " page found." : " pages found.")
        : "No pages found. Try different search terms.";
      if (index.failedCount) {
        countMessage += " " + index.failedCount + " page" +
          (index.failedCount === 1 ? " was" : "s were") + " unavailable to search.";
      }
      searchStatus.textContent = countMessage;
      if (pageStatus) pageStatus.textContent = countMessage;
    }).catch(function (error) {
      searchStatus.textContent = "Search is unavailable: " + error.message;
      if (pageStatus) pageStatus.textContent = "Search is unavailable: " + error.message;
    });
  }

  function getSearchQuery() {
    var params = new URLSearchParams(window.location.search);
    return params.get("k") || params.get("q") || "";
  }

  searchInput.value = getSearchQuery();
  searchInput.addEventListener("input", function () {
    renderSearchResults(searchInput.value);
  });
  window.addEventListener("popstate", function () {
    searchInput.value = getSearchQuery();
    renderSearchResults(searchInput.value);
  });
  document.addEventListener("click", function (event) {
    if (!searchForm.contains(event.target)) resultsPanel.hidden = true;
  });
  searchInput.addEventListener("focus", function () {
    if (searchInput.value.trim()) {
      resultsPanel.hidden = false;
      if (!searchResults.children.length) renderSearchResults(searchInput.value);
    }
  });
  if (searchInput.value) renderSearchResults(searchInput.value);
}

// Mobile menu
var burger = document.getElementById("burger");
var nav = document.getElementById("nav");
if (burger && nav) {
  burger.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", open);
  });
}

// Mobile header search
var searchToggle = document.getElementById("search-toggle");
var siteHeader = document.querySelector(".top");
if (searchToggle && siteHeader && searchInput) {
  searchToggle.addEventListener("click", function () {
    var open = siteHeader.classList.toggle("search-open");
    searchToggle.setAttribute("aria-expanded", open);
    searchToggle.setAttribute("aria-label", open ? "Close search" : "Open search");
    if (open) searchInput.focus();
  });
  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && siteHeader.classList.contains("search-open")) {
      siteHeader.classList.remove("search-open");
      searchToggle.setAttribute("aria-expanded", "false");
      searchToggle.setAttribute("aria-label", "Open search");
      searchToggle.focus();
    }
  });
  document.addEventListener("click", function (event) {
    if (!siteHeader.classList.contains("search-open") ||
        searchForm.contains(event.target) ||
        searchToggle.contains(event.target)) return;
    siteHeader.classList.remove("search-open");
    searchToggle.setAttribute("aria-expanded", "false");
    searchToggle.setAttribute("aria-label", "Open search");
  });
}

// Contact page: ?service=seo wagaira se dropdown pehle se select ho jata hai
var sel = document.getElementById("service");
if (sel) {
  var s = new URLSearchParams(window.location.search).get("service");
  if (s) sel.value = s;
}

// Homepage service accordion enhancement; the full service content stays visible without JavaScript.
var serviceAccordion = document.getElementById("service-accordion");
if (serviceAccordion) {
  var serviceToggles = Array.from(serviceAccordion.querySelectorAll(".service-toggle"));
  var servicePanels = serviceToggles.map(function (toggle) {
    return document.getElementById(toggle.getAttribute("aria-controls"));
  });

  function activateService(index) {
    serviceToggles.forEach(function (toggle, toggleIndex) {
      var isExpanded = toggleIndex === index;
      toggle.setAttribute("aria-expanded", isExpanded);
      toggle.classList.toggle("is-active", isExpanded);
      servicePanels[toggleIndex].hidden = !isExpanded;
    });
  }

  if (serviceToggles.length && servicePanels.every(Boolean)) {
    serviceAccordion.classList.add("is-enhanced");
    activateService(0);

    serviceToggles.forEach(function (toggle, index) {
      toggle.addEventListener("click", function () {
        var isExpanded = toggle.getAttribute("aria-expanded") === "true";
        activateService(isExpanded ? -1 : index);
      });
      toggle.addEventListener("keydown", function (event) {
        var nextIndex = index;
        if (event.key === "ArrowDown") nextIndex = (index + 1) % serviceToggles.length;
        else if (event.key === "ArrowUp") nextIndex = (index - 1 + serviceToggles.length) % serviceToggles.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = serviceToggles.length - 1;
        else return;
        event.preventDefault();
        serviceToggles[nextIndex].focus();
      });
    });
  }
}
