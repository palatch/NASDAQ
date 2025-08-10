
document.getElementById('imageInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = document.createElement('img');
    img.src = evt.target.result;
    img.style.maxWidth = '100%';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('imagePreview').appendChild(img);
  };
  reader.readAsDataURL(file);
});
