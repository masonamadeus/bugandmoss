function navigate(viewId) {
  // 1. Unsaved Changes Guard
  const createView = document.getElementById('view-create');
  if (createView && createView.classList.contains('active') && viewId !== 'create') {
    if (typeof create !== 'undefined' && create.hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to leave without saving?')) {
        return; // Abort navigation
      }
    }
  }

  // 2. Hide all views
  document.querySelectorAll('.view').forEach(el => {
    el.classList.remove('active');
    el.classList.add('hidden');
  });
  
  // 3. Show target view
  const target = document.getElementById(`view-${viewId}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }

  // 4. Handle Fullscreen UI logic
  if (viewId === 'perform') {
    document.body.classList.add('perform-active');
  } else {
    document.body.classList.remove('perform-active');
    // Hard-stop any orphaned media by destroying inner HTML just in case
    const perfContent = document.getElementById('perf-content');
    if (perfContent) perfContent.innerHTML = '';
  }
}