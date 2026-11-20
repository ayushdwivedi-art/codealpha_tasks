const $ = (s) => document.querySelector(s);
let currentUser = null;
let authMode = "login";
let activeProfileId = null;
let previewUrl = null;

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function avatar(user, extra = "") {
  const label = (user.username || "U").charAt(0).toUpperCase();
  return `<div class="avatar ${extra}">${user.avatar ? `<img src="${escapeHtml(user.avatar)}" alt="">` : label}</div>`;
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function timeAgo(date) {
  const d = new Date(date.replace(" ", "T") + (date.includes("Z") ? "" : "Z"));
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "just now"; if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.mode === mode));
  $("#usernameLabel").classList.toggle("hidden", mode !== "register");
  $("#emailLabel").classList.toggle("hidden", mode !== "register");
  $("#loginLabel").classList.toggle("hidden", mode !== "login");
  $("#authSubmit").innerHTML = mode === "login" ? 'Log in <span>→</span>' : 'Create account <span>→</span>';
  $("#authMessage").textContent = "";
}
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => setAuthMode(t.dataset.mode)));
$("#authForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#authMessage").textContent = "";
  const body = authMode === "login"
    ? { login: $("#loginInput").value, password: $("#passwordInput").value }
    : { username: $("#usernameInput").value, email: $("#emailInput").value, password: $("#passwordInput").value };
  try {
    const data = await api(`/api/auth/${authMode === "login" ? "login" : "register"}`, {
      method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body)
    });
    currentUser = data.user; showApp(); toast("Welcome to SocialHub!");
  } catch (err) { $("#authMessage").textContent = err.message; }
});
async function boot() {
  try { const data = await api("/api/me"); if (data.user) { currentUser = data.user; showApp(); } }
  catch (_) {}
}
function showApp() {
  $("#authView").classList.add("hidden"); $("#appView").classList.remove("hidden");
  $("#sidebarUser").innerHTML = `${avatar(currentUser)}<div><strong>${escapeHtml(currentUser.username)}</strong><small>My account</small></div>`;
  $("#composerAvatar").innerHTML = currentUser.avatar ? `<img src="${escapeHtml(currentUser.avatar)}">` : escapeHtml(currentUser.username[0].toUpperCase());
  showView("feed"); loadFeed();
}
async function logout() {
  await api("/api/auth/logout", {method:"POST"});
  currentUser = null; $("#appView").classList.add("hidden"); $("#authView").classList.remove("hidden");
  $("#authForm").reset(); setAuthMode("login");
}
$("#logoutBtn").addEventListener("click", logout);
function showView(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $(`#${view}View`).classList.remove("hidden");
  document.querySelectorAll(".nav-item[data-view]").forEach(n => n.classList.toggle("active", n.dataset.view === view));
  const titles = {feed:["YOUR DAILY DOSE","Home feed"],explore:["FIND YOUR PEOPLE","Explore"],profile:["YOUR CORNER","My profile"]};
  $("#pageEyebrow").textContent = titles[view][0]; $("#pageTitle").textContent = titles[view][1];
  if (view === "profile") loadProfile(currentUser.id);
}
document.querySelectorAll(".nav-item[data-view]").forEach(n => n.addEventListener("click", () => showView(n.dataset.view)));
document.querySelectorAll("[data-go]").forEach(n => n.addEventListener("click", () => showView(n.dataset.go)));

$("#postContent").addEventListener("input", () => $("#charCount").textContent = `${$("#postContent").value.length} / 2000`);
$("#postImage").addEventListener("change", () => {
  const file = $("#postImage").files[0];
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  if (!file) { $("#imagePreview").classList.add("hidden"); return; }
  previewUrl = URL.createObjectURL(file);
  $("#imagePreview").innerHTML = `<img src="${previewUrl}" alt="Selected image">`;
  $("#imagePreview").classList.remove("hidden");
});
$("#createPostForm").addEventListener("submit", async e => {
  e.preventDefault(); const form = new FormData();
  form.append("content", $("#postContent").value);
  if ($("#postImage").files[0]) form.append("image", $("#postImage").files[0]);
  try {
    await api("/api/posts", {method:"POST",body:form});
    $("#createPostForm").reset(); $("#charCount").textContent = "0 / 2000";
    $("#imagePreview").innerHTML = ""; $("#imagePreview").classList.add("hidden");
    loadFeed(); toast("Your post is live!");
  } catch (err) { $("#postMessage").textContent = err.message; }
});
async function loadFeed() {
  $("#feedPosts").innerHTML = '<div class="loading">Loading your feed…</div>';
  try { const data = await api("/api/feed"); renderPosts(data.posts, $("#feedPosts")); }
  catch (err) { $("#feedPosts").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; }
}
function renderPosts(posts, container) {
  if (!posts.length) { container.innerHTML = '<div class="empty-state">No posts yet. Be the first to share something ✳</div>'; return; }
  container.innerHTML = posts.map(post => `
    <article class="post-card" data-post="${post.id}">
      <div class="post-head">${avatar({username:post.username,avatar:post.avatar})}<div class="post-author"><strong>${escapeHtml(post.username)}</strong><small>${timeAgo(post.created_at)}</small></div>
      ${post.user_id === currentUser.id ? '<span class="muted">Your post</span>' : `<button class="action-btn" data-profile="${post.user_id}">View profile ↗</button>`}
      </div>
      ${post.content ? `<p class="post-content">${escapeHtml(post.content)}</p>` : ""}
      ${post.image ? `<img class="post-image" src="${escapeHtml(post.image)}" alt="Post image">` : ""}
      <div class="post-actions"><button class="action-btn like-btn ${post.liked ? "liked" : ""}" data-like="${post.id}">${post.liked ? "♥ Liked" : "♡ Like"} · <span>${post.likeCount}</span></button><button class="action-btn comment-toggle" data-comments="${post.id}">◯ Comment · ${post.commentCount}</button></div>
      <div class="comments hidden" id="comments-${post.id}"><div class="comment-list">Loading comments…</div><form class="comment-form" data-comment-form="${post.id}"><input name="comment" maxlength="500" placeholder="Write a comment…" required><button>Send</button></form></div>
    </article>`).join("");
  container.querySelectorAll("[data-like]").forEach(btn => btn.addEventListener("click", () => toggleLike(btn)));
  container.querySelectorAll("[data-comments]").forEach(btn => btn.addEventListener("click", () => toggleComments(btn)));
  container.querySelectorAll("[data-profile]").forEach(btn => btn.addEventListener("click", () => { showView("profile"); loadProfile(Number(btn.dataset.profile)); }));
  container.querySelectorAll("[data-comment-form]").forEach(form => form.addEventListener("submit", submitComment));
}
async function toggleLike(btn) {
  try {
    const data = await api(`/api/posts/${btn.dataset.like}/like`, {method:"POST"});
    btn.classList.toggle("liked", data.liked); btn.innerHTML = `${data.liked ? "♥ Liked" : "♡ Like"} · <span>${data.likeCount}</span>`;
  } catch (err) { toast(err.message); }
}
async function toggleComments(btn) {
  const id = btn.dataset.comments, box = $(`#comments-${id}`);
  box.classList.toggle("hidden");
  if (box.dataset.loaded) return;
  try {
    const data = await api(`/api/posts/${id}/comments`);
    box.querySelector(".comment-list").innerHTML = data.comments.length
      ? data.comments.map(c => `<p class="comment-row"><strong>${escapeHtml(c.username)}</strong>${escapeHtml(c.comment_text)}</p>`).join("")
      : '<p class="muted">No comments yet. Start the conversation.</p>';
    box.dataset.loaded = "1";
  } catch (err) { box.querySelector(".comment-list").textContent = err.message; }
}
async function submitComment(e) {
  e.preventDefault(); const form = e.currentTarget, id = form.dataset.commentForm;
  const input = form.elements.comment;
  try {
    await api(`/api/posts/${id}/comments`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({comment:input.value})});
    input.value = ""; const box = $(`#comments-${id}`); delete box.dataset.loaded;
    await api(`/api/posts/${id}/comments`).then(data => {
      box.querySelector(".comment-list").innerHTML = data.comments.map(c => `<p class="comment-row"><strong>${escapeHtml(c.username)}</strong>${escapeHtml(c.comment_text)}</p>`).join("");
      box.dataset.loaded = "1";
    });
    const toggle = document.querySelector(`[data-comments="${id}"]`);
    const count = Number(toggle.textContent.match(/\d+/)?.[0] || 0) + 1;
    toggle.textContent = `◯ Comment · ${count}`;
  } catch (err) { toast(err.message); }
}

let searchTimer;
$("#userSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = $("#userSearch").value.trim();
  if (!q) { $("#userResults").innerHTML = '<p class="muted">Start typing to find people.</p>'; return; }
  searchTimer = setTimeout(searchUsers, 250);
});
async function searchUsers() {
  try {
    const data = await api(`/api/users/search?q=${encodeURIComponent($("#userSearch").value.trim())}`);
    $("#userResults").innerHTML = data.users.length ? data.users.map(userCard).join("") : '<p class="muted">No people found. Try another username.</p>';
    bindFollowButtons($("#userResults"));
    $("#userResults").querySelectorAll("[data-profile]").forEach(b => b.addEventListener("click", () => loadProfile(Number(b.dataset.profile))));
  } catch (err) { toast(err.message); }
}
function userCard(user) {
  return `<div class="user-card">${avatar(user)}<div class="user-info"><strong>${escapeHtml(user.username)}</strong><p>${escapeHtml(user.bio || "Finding their corner of the internet.")}</p></div><button class="follow-btn ${user.isFollowing ? "following" : ""}" data-follow="${user.id}">${user.isFollowing ? "Following" : "Follow"}</button><button class="action-btn" data-profile="${user.id}">↗</button></div>`;
}
function bindFollowButtons(root) {
  root.querySelectorAll("[data-follow]").forEach(btn => btn.addEventListener("click", async () => {
    try {
      const data = await api(`/api/users/${btn.dataset.follow}/follow`, {method:"POST"});
      btn.textContent = data.following ? "Following" : "Follow"; btn.classList.toggle("following", data.following);
    } catch (err) { toast(err.message); }
  }));
}
async function loadProfile(id) {
  activeProfileId = id;
  $("#profileContent").innerHTML = '<div class="loading">Loading profile…</div>';
  try {
    const data = await api(`/api/users/${id}`);
    const user = data.user;
    $("#profileContent").innerHTML = `
      <div class="profile-header">
        <div class="profile-top">${avatar(user,"profile-avatar")}<div class="profile-details"><h3>${escapeHtml(user.username)}</h3><p>${escapeHtml(user.bio || "A new face in the SocialHub community.")}</p></div>
          <div class="profile-actions">${user.isMe ? '<button class="outline-btn" id="editProfileBtn">Edit profile</button>' : `<button class="primary-btn" id="profileFollowBtn">${user.isFollowing ? "Following" : "Follow"}</button>`}</div>
        </div>
        <div class="profile-stats"><div><strong>${data.posts.length}</strong><span>Posts</span></div><div><strong>${user.followers}</strong><span>Followers</span></div><div><strong>${user.following}</strong><span>Following</span></div></div>
        ${user.isMe ? `<form class="edit-profile hidden" id="editProfileForm"><label>Bio<textarea name="bio" maxlength="160" placeholder="A little about you…">${escapeHtml(user.bio)}</textarea></label><label>Profile photo<input name="avatar" type="file" accept="image/*"></label><button class="primary-btn">Save profile</button></form>` : ""}
      </div>
      <div class="section-heading"><div><p class="eyebrow">THEIR MOMENTS</p><h3>${user.isMe ? "Your posts" : `${escapeHtml(user.username)}'s posts`}</h3></div></div>
      <div id="profilePosts" class="posts-list"></div>`;
    renderPosts(data.posts, $("#profilePosts"));
    if (user.isMe) {
      $("#editProfileBtn").addEventListener("click", () => $("#editProfileForm").classList.toggle("hidden"));
      $("#editProfileForm").addEventListener("submit", saveProfile);
    } else {
      $("#profileFollowBtn").addEventListener("click", async e => {
        const result = await api(`/api/users/${id}/follow`, {method:"POST"});
        e.currentTarget.textContent = result.following ? "Following" : "Follow";
        loadProfile(id);
      });
    }
  } catch (err) { $("#profileContent").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`; }
}
async function saveProfile(e) {
  e.preventDefault(); const form = new FormData(e.currentTarget);
  try {
    const data = await api("/api/profile", {method:"PUT",body:form});
    currentUser = data.user; showApp(); showView("profile"); loadProfile(currentUser.id); toast("Profile updated.");
  } catch (err) { toast(err.message); }
}
boot();
