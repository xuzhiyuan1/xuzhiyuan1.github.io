/* =========================================================
   Destinations — render + filter + search
   纯静态 JS,无依赖。
   ========================================================= */

(function () {
    "use strict";

    var data = (window.DESTINATIONS && window.DESTINATIONS) || { visited: [], wishlist: [] };
    var filter = "all";      // all | visited | wishlist
    var query = "";

    var visitedGrid = document.getElementById("visitedGrid");
    var wishlistGrid = document.getElementById("wishlistGrid");
    var visitedSection = document.getElementById("visitedSection");
    var wishlistSection = document.getElementById("wishlistSection");
    var visitedCount = document.getElementById("visitedCount");
    var wishlistCount = document.getElementById("wishlistCount");
    var visitedEmpty = document.getElementById("visitedEmpty");
    var wishlistEmpty = document.getElementById("wishlistEmpty");
    var searchInput = document.getElementById("search");

    /* ---------- helpers ---------- */

    function escapeHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function matchesQuery(item) {
        if (!query) return true;
        var hay = (item.city + " " + item.country + " " + (item.note || "")).toLowerCase();
        return hay.indexOf(query) !== -1;
    }

    function renderCard(item) {
        var meta = [];
        if (item.year) {
            meta.push('<span class="tag tag-year">' + escapeHtml(item.year) + '</span>');
        }
        if (item.priority) {
            meta.push('<span class="tag tag-priority">优先级 · ' + escapeHtml(item.priority) + '</span>');
        }

        var noteHtml = item.note
            ? '<p class="card-note">' + escapeHtml(item.note) + '</p>'
            : "";

        var linkHtml = item.link
            ? '<a class="card-link" href="' + escapeHtml(item.link) + '">查看记录 →</a>'
            : "";

        return (
            '<article class="card">' +
                '<h3 class="card-city">' + escapeHtml(item.city) + '</h3>' +
                '<p class="card-country">' + escapeHtml(item.country) + '</p>' +
                (meta.length ? '<div class="card-meta">' + meta.join("") + '</div>' : "") +
                noteHtml +
                linkHtml +
            '</article>'
        );
    }

    function renderList(items, container) {
        if (!items.length) {
            container.innerHTML = "";
            return;
        }
        container.innerHTML = items.map(renderCard).join("");
    }

    function applyFilters() {
        var v = (data.visited || []).filter(matchesQuery);
        var w = (data.wishlist || []).filter(matchesQuery);

        // visible toggle
        visitedSection.classList.toggle("hidden", filter === "wishlist");
        wishlistSection.classList.toggle("hidden", filter === "visited");

        // counts (counts reflect search, not filter — feels more honest)
        visitedCount.textContent = v.length;
        wishlistCount.textContent = w.length;

        // empty states
        visitedEmpty.classList.toggle("hidden", v.length !== 0);
        wishlistEmpty.classList.toggle("hidden", w.length !== 0);

        renderList(v, visitedGrid);
        renderList(w, wishlistGrid);
    }

    /* ---------- wire up ---------- */

    document.querySelectorAll(".filter-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".filter-btn").forEach(function (b) {
                b.classList.remove("is-active");
                b.setAttribute("aria-selected", "false");
            });
            btn.classList.add("is-active");
            btn.setAttribute("aria-selected", "true");
            filter = btn.getAttribute("data-filter") || "all";
            applyFilters();
        });
    });

    if (searchInput) {
        searchInput.addEventListener("input", function () {
            query = searchInput.value.trim().toLowerCase();
            applyFilters();
        });
    }

    // initial render
    applyFilters();
})();
