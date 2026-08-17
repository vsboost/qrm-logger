// Image Store - handles PhotoSwipe v5 image viewer functionality
document.addEventListener('alpine:init', () => {
  Alpine.store('image', {
    // Initialize from localStorage if needed
    init() {
      // Can add persistence here if needed
    },
    
    // State
    captureSpecs: [], // Will hold spec objects with id
    selectedDay: null, // Currently active day
    availableDays: [], // List of all available days (sorted newest first)
    imageSize: 'resized', // 'resized' or 'full'
    lightbox: null, // PhotoSwipe lightbox instance
    currentCaptureSpecId: null, // Track current spec for reloading
    currentImagePaths: [], // Track current raw paths for reloading
    preloadBefore: 1, // Number of images to preload before current
    preloadAfter: 3, // Number of images to preload after current
    isLoadingAdjacentDay: false, // Prevent multiple simultaneous day transitions
    lastIndexViewed: -1, // Track last viewed index to detect boundary crossing
    transitionDebounceTimer: null, // Debounce timer for transitions
    
    // Toggle between browse button and spec selection
    toggleBrowse(day) {
      // If clicking the same day, toggle off
      if (this.selectedDay === day) {
        this.selectedDay = null
      } else {
        // Otherwise, switch to the new day
        this.selectedDay = day
        // Update available days list from grid store
        this.updateAvailableDays()
        // Load capture specs when showing them
        this.loadCaptureSpecs()
      }
    },
    
    // Update the available days list from grid store
    updateAvailableDays() {
      try {
        const groupedData = Alpine.store('grid').getGroupedData()
        this.availableDays = groupedData.map(g => g.date)
      } catch (error) {
        console.error('Error updating available days:', error)
        this.availableDays = []
      }
    },
    
    // Navigate to previous day (older)
    async navigateToPreviousDay() {
      if (!this.selectedDay || this.availableDays.length === 0) return
      
      const currentIndex = this.availableDays.indexOf(this.selectedDay)
      if (currentIndex === -1 || currentIndex >= this.availableDays.length - 1) return
      
      // Move to next index (older day, since array is sorted newest first)
      const newDay = this.availableDays[currentIndex + 1]
      this.selectedDay = newDay
      
      // Reload images without closing lightbox
      if (this.currentCaptureSpecId) {
        await this.reloadImagesForCurrentDay()
      }
    },
    
    // Navigate to next day (newer)
    async navigateToNextDay() {
      if (!this.selectedDay || this.availableDays.length === 0) return
      
      const currentIndex = this.availableDays.indexOf(this.selectedDay)
      if (currentIndex === -1 || currentIndex <= 0) return
      
      // Move to previous index (newer day, since array is sorted newest first)
      const newDay = this.availableDays[currentIndex - 1]
      this.selectedDay = newDay
      
      // Reload images without closing lightbox
      if (this.currentCaptureSpecId) {
        await this.reloadImagesForCurrentDay()
      }
    },
    
    // Check if navigation buttons should be enabled
    canNavigateToPreviousDay() {
      if (!this.selectedDay || this.availableDays.length === 0) return false
      const currentIndex = this.availableDays.indexOf(this.selectedDay)
      return currentIndex !== -1 && currentIndex < this.availableDays.length - 1
    },
    
    canNavigateToNextDay() {
      if (!this.selectedDay || this.availableDays.length === 0) return false
      const currentIndex = this.availableDays.indexOf(this.selectedDay)
      return currentIndex !== -1 && currentIndex > 0
    },
    
    // Load capture specs for the current capture set
    async loadCaptureSpecs() {
      try {
        const response = await fetch('/capture_sets_with_specs')
        const json = await response.json()
        const currentSetId = Alpine.store('app').currentCaptureSetId
        
        // Get specs for the current capture set
        const specs = json.data[currentSetId] || []
        this.captureSpecs = specs
      } catch (error) {
        console.error('Error loading capture specs:', error)
        this.captureSpecs = []
      }
    },
    
    // Fetch images and open PhotoSwipe viewer
    async openImages(captureSpecId) {
      try {
        const currentSetId = Alpine.store('app').currentCaptureSetId
        const plotType = Alpine.store('grid').plotType || 'waterfall'
        const day = this.selectedDay
        const imageSize = this.imageSize || 'resized'
        
        // Format the date for display in the viewer
        const formattedDate = Alpine.store('grid').formatDay(day)
        
        // Call the REST endpoint (always use 'latest' order)
        const url = `/images?capture_set_id=${encodeURIComponent(currentSetId)}&capture_spec_id=${encodeURIComponent(captureSpecId)}&grid_type=${encodeURIComponent(plotType)}&day=${encodeURIComponent(day)}&image_size=${encodeURIComponent(imageSize)}&order=latest`
        const response = await fetch(url)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch images: ${response.status}`)
        }
        
        const json = await response.json()
        const images = json.data || []
        
        if (images.length === 0) {
          Alpine.store('app').showToast('No images found for this capture spec', 'warning')
          return
        }
        
        // Store current state for reloading
        this.currentCaptureSpecId = captureSpecId
        this.currentImagePaths = images
        this.lastIndexViewed = -1 // Reset index tracking when opening new set
        
        // Initialize and open PhotoSwipe with formatted date
        this.initPhotoSwipe(images, 0, formattedDate)
      } catch (error) {
        console.error('Error opening images:', error)
        Alpine.store('app').showToast('Error loading images: ' + error.message, 'error')
      }
    },
    
    // Reload images for current day without destroying lightbox
    async reloadImagesForCurrentDay() {
      if (!this.lightbox || !this.lightbox.pswp) {
        // Lightbox not open, use normal method
        if (this.currentCaptureSpecId) {
          await this.openImages(this.currentCaptureSpecId)
        }
        return
      }
      
      try {
        const currentSetId = Alpine.store('app').currentCaptureSetId
        const plotType = Alpine.store('grid').plotType || 'waterfall'
        const day = this.selectedDay
        const imageSize = this.imageSize || 'resized'
        const captureSpecId = this.currentCaptureSpecId
        
        // Format the date for display in the viewer
        const formattedDate = Alpine.store('grid').formatDay(day)
        
        // Call the REST endpoint (always use 'latest' order)
        const url = `/images?capture_set_id=${encodeURIComponent(currentSetId)}&capture_spec_id=${encodeURIComponent(captureSpecId)}&grid_type=${encodeURIComponent(plotType)}&day=${encodeURIComponent(day)}&image_size=${encodeURIComponent(imageSize)}&order=latest`
        const response = await fetch(url)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch images: ${response.status}`)
        }
        
        const json = await response.json()
        const images = json.data || []
        
        if (images.length === 0) {
          Alpine.store('app').showToast('No images found for this day', 'warning')
          return
        }
        
        // Update current state
        this.currentImagePaths = images
        
        // Update images in the existing lightbox without destroying it
        const pswp = this.lightbox.pswp
        const subdirectory = imageSize === 'full' ? 'plots_full' : 'plots_resized'
        
        // Build new dataSource
        const newDataSource = images.map(path => {
          const fullPath = `/output/${currentSetId}/${subdirectory}/${path}`
          return {
            src: fullPath,
            width: 2000,
            height: 800,
            alt: path
          }
        })
        
        // Update the dataSource
        pswp.options.dataSource = newDataSource
        
        // Go to first image of the new day
        pswp.goTo(0)
        
        // Force refresh of all visible slides
        for (let i = 0; i < Math.min(newDataSource.length, this.preloadBefore + 1 + this.preloadAfter); i++) {
          pswp.refreshSlideContent(i)
        }
        
        // Update the date display in the UI
        this.updateDateDisplay(formattedDate)
        
        // Update button states
        this.updateDayNavigationButtonStates()
        
      } catch (error) {
        console.error('Error reloading images:', error)
        Alpine.store('app').showToast('Error loading images: ' + error.message, 'error')
      }
    },
    
    // Update date display in PhotoSwipe UI
    updateDateDisplay(formattedDate) {
      if (!this.lightbox || !this.lightbox.pswp) return
      
      try {
        const dateSpan = document.querySelector('.pswp__date-display')
        if (dateSpan) {
          dateSpan.textContent = formattedDate
        }
      } catch (error) {
        console.error('Error updating date display:', error)
      }
    },
    
    // Update day navigation button states
    updateDayNavigationButtonStates() {
      if (!this.lightbox || !this.lightbox.pswp) return
      
      try {
        const dayPrevBtn = document.querySelector('.pswp-day-prev')
        const dayNextBtn = document.querySelector('.pswp-day-next')
        
        if (dayPrevBtn) {
          const canGoPrev = this.canNavigateToPreviousDay()
          dayPrevBtn.disabled = !canGoPrev
          dayPrevBtn.style.opacity = canGoPrev ? '1' : '0.4'
          dayPrevBtn.style.cursor = canGoPrev ? 'pointer' : 'not-allowed'
        }
        
        if (dayNextBtn) {
          const canGoNext = this.canNavigateToNextDay()
          dayNextBtn.disabled = !canGoNext
          dayNextBtn.style.opacity = canGoNext ? '1' : '0.4'
          dayNextBtn.style.cursor = canGoNext ? 'pointer' : 'not-allowed'
        }
      } catch (error) {
        console.error('Error updating button states:', error)
      }
    },
    
    // Update image sources without destroying lightbox
    updateImageSources() {
      if (!this.lightbox || !this.lightbox.pswp || !this.currentImagePaths) return
      
      const pswp = this.lightbox.pswp
      const currentIndex = pswp.currIndex || 0
      
      // Get current state for constructing URLs
      const currentSetId = Alpine.store('app').currentCaptureSetId
      const imageSize = this.imageSize || 'resized'
      const subdirectory = imageSize === 'full' ? 'plots_full' : 'plots_resized'
      
      // Build new dataSource with updated URLs
      const newDataSource = this.currentImagePaths.map(path => {
        const fullPath = `/output/${currentSetId}/${subdirectory}/${path}`
        return {
          src: fullPath,
          width: 2000,
          height: 800,
          alt: path
        }
      })
      
      // Update the dataSource
      pswp.options.dataSource = newDataSource
      
      // Refresh current and preloaded slides
      for (let i = currentIndex - this.preloadBefore; i <= currentIndex + this.preloadAfter; i++) {
        if (i >= 0 && i < newDataSource.length) {
          pswp.refreshSlideContent(i)
        }
      }
    },
    
    // Initialize PhotoSwipe with image data
    initPhotoSwipe(imagePaths, startIndex = 0, formattedDate = null) {
      // Check if PhotoSwipe is available
      if (!window.PhotoSwipeLightbox || !window.PhotoSwipe) {
        console.error('PhotoSwipe libraries not loaded', {
          PhotoSwipeLightbox: !!window.PhotoSwipeLightbox,
          PhotoSwipe: !!window.PhotoSwipe
        })
        Alpine.store('app').showToast('PhotoSwipe library not loaded. Please refresh the page.', 'error')
        return
      }
      
      // Get current state for constructing full URLs
      const currentSetId = Alpine.store('app').currentCaptureSetId
      const imageSize = this.imageSize || 'resized'
      const subdirectory = imageSize === 'full' ? 'plots_full' : 'plots_resized'
      
      // Prepare data for PhotoSwipe
      const dataSource = imagePaths.map(path => {
        // Construct full path: /output/{capture_set_id}/{subdirectory}/{day}/{filename}
        // The path from backend is: {day}/{filename}
        const fullPath = `/output/${currentSetId}/${subdirectory}/${path}`
        return {
          src: fullPath,
          // Use large placeholder dimensions - PhotoSwipe will scale to fit viewport
          width: 2000,
          height: 800,
          alt: path
        }
      })
      
      // Destroy existing lightbox if any
      if (this.lightbox) {
        try {
          this.lightbox.destroy()
        } catch (e) {
          console.warn('Error destroying previous lightbox:', e)
        }
      }
      
      try {
        // Create and open PhotoSwipe lightbox
        this.lightbox = new PhotoSwipeLightbox({
          dataSource: dataSource,
          pswpModule: window.PhotoSwipe,
          preload: [this.preloadBefore, this.preloadAfter], // Preload images before/after current
          bgOpacity: 0.95,
          spacing: 0.1,
          allowPanToNext: true,
          loop: false,
          closeOnVerticalDrag: false,  // Disable vertical drag to close
          pinchToClose: false,          // Disable pinch to close
          clickToCloseNonZoomable: false, // Disable click on background to close
          tapAction: false,             // Disable tap on image to close
          showHideAnimationType: 'fade',
          initialZoomLevel: 'fit',  // Fit to viewport
          secondaryZoomLevel: 1,    // 100% zoom on double-click
          maxZoomLevel: 2           // Allow 2x zoom
        })
        
        // Add custom UI elements
        this.lightbox.on('uiRegister', () => {
          // Day label on the left
          this.lightbox.pswp.ui.registerElement({
            name: 'day-label',
            order: 4,
            isButton: false,
            appendTo: 'wrapper',
            html: `
              <div class="pswp__day-label" style="position: fixed; top: 12px; left: 120px; display: flex; align-items: center; gap: 10px; padding: 8px 16px; font-size: 13px; color: white; background: rgba(0, 0, 0, 0.4); border-radius: 4px; z-index: 10000; pointer-events: auto;">
                ${formattedDate ? `<span class="pswp__date-display" style="font-weight: 600; color: darkorange;">${formattedDate}</span>` : ''}
              </div>
            `
          })
          
          // Day navigation buttons centered
          this.lightbox.pswp.ui.registerElement({
            name: 'day-navigation',
            order: 5,
            isButton: false,
            appendTo: 'wrapper',
            html: `
              <div class="pswp__day-navigation" style="position: fixed; top: 12px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 8px 16px; font-size: 13px; color: white; background: rgba(0, 0, 0, 0.4); border-radius: 4px; z-index: 10000; pointer-events: auto;">
                <span style="font-weight: 500; color: white;">Day <span class="pswp__day-index"></span></span>
                <button 
                  class="pswp-day-nav-btn pswp-day-next" 
                  style="padding: 4px 10px; font-size: 12px; border: 1px solid #888; border-radius: 3px; cursor: pointer; background: transparent; color: #aaa; font-weight: normal;">
                  +
                </button>
                <button 
                  class="pswp-day-nav-btn pswp-day-prev" 
                  style="padding: 4px 10px; font-size: 12px; border: 1px solid #888; border-radius: 3px; cursor: pointer; background: transparent; color: #aaa; font-weight: normal;">
                  -
                </button>
              </div>
            `,
            onInit: (el, pswp) => {
              // Get reference to the image store
              const imageStore = Alpine.store('image')
              
              // Handle day navigation buttons
              const dayPrevBtn = el.querySelector('.pswp-day-prev')
              const dayNextBtn = el.querySelector('.pswp-day-next')
              
              const updateDayIndex = () => {
                const dayIndexSpan = el.querySelector('.pswp__day-index')
                if (dayIndexSpan && imageStore.selectedDay && imageStore.availableDays.length > 0) {
                  const currentIndex = imageStore.availableDays.indexOf(imageStore.selectedDay)
                  if (currentIndex !== -1) {
                    const displayIndex = currentIndex + 1
                    const total = imageStore.availableDays.length
                    dayIndexSpan.textContent = `${displayIndex}/${total}`
                  }
                }
              }
              
              const updateDayButtonStates = () => {
                if (dayPrevBtn) {
                  const canGoPrev = imageStore.canNavigateToPreviousDay()
                  dayPrevBtn.disabled = !canGoPrev
                  dayPrevBtn.style.opacity = canGoPrev ? '1' : '0.4'
                  dayPrevBtn.style.cursor = canGoPrev ? 'pointer' : 'not-allowed'
                }
                if (dayNextBtn) {
                  const canGoNext = imageStore.canNavigateToNextDay()
                  dayNextBtn.disabled = !canGoNext
                  dayNextBtn.style.opacity = canGoNext ? '1' : '0.4'
                  dayNextBtn.style.cursor = canGoNext ? 'pointer' : 'not-allowed'
                }
                
                // Update day index whenever buttons update
                updateDayIndex()
              }
              
              // Initial button state
              updateDayButtonStates()
              
              // Update button states when day changes (e.g., after auto-transition)
              pswp.on('change', () => {
                updateDayButtonStates()
              })
              
              if (dayPrevBtn) {
                dayPrevBtn.addEventListener('click', async (e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  
                  console.log('Day -1 clicked')
                  if (imageStore.canNavigateToPreviousDay()) {
                    await imageStore.navigateToPreviousDay()
                  }
                }, true)
              }
              
              if (dayNextBtn) {
                dayNextBtn.addEventListener('click', async (e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  
                  console.log('Day +1 clicked')
                  if (imageStore.canNavigateToNextDay()) {
                    await imageStore.navigateToNextDay()
                  }
                }, true)
              }
            }
          })
          
          // Image size controls on the right side
          this.lightbox.pswp.ui.registerElement({
            name: 'image-size-controls',
            order: 9,
            isButton: false,
            appendTo: 'wrapper',
            html: `
              <div class="pswp__image-size-controls" style="position: fixed; top: 12px; right: 120px; display: flex; align-items: center; gap: 10px; padding: 8px 16px; font-size: 13px; color: white; background: rgba(0, 0, 0, 0.4); border-radius: 4px; z-index: 10000; pointer-events: auto;">
                <span style="font-weight: 500; margin-right: 4px; color: white;">Size:</span>
                <button 
                  class="pswp-size-btn" 
                  data-size="resized" 
                  style="padding: 4px 12px; font-size: 12px; border: 1px solid ${this.imageSize === 'resized' ? 'darkorange' : '#888'}; border-radius: 3px; cursor: pointer; background: transparent; color: ${this.imageSize === 'resized' ? 'darkorange' : '#aaa'}; font-weight: normal;">
                  Resized
                </button>
                <button 
                  class="pswp-size-btn" 
                  data-size="full" 
                  style="padding: 4px 12px; font-size: 12px; border: 1px solid ${this.imageSize === 'full' ? 'darkorange' : '#888'}; border-radius: 3px; cursor: pointer; background: transparent; color: ${this.imageSize === 'full' ? 'darkorange' : '#aaa'}; font-weight: normal;">
                  Full
                </button>
                  <button 
                    class="pswp-delete-btn" 
                    title="Delete this recording" 
                    style="padding: 4px 12px; font-size: 12px; border: 1px solid #d9534f; border-radius: 3px; cursor: pointer; background: transparent; color: #f88; font-weight: normal;">
                    Delete
                  </button>
              </div>
            `,
            onInit: (el, pswp) => {
              // Get reference to the image store
              const imageStore = Alpine.store('image')
              
              // Handle size buttons
              const sizeButtons = el.querySelectorAll('.pswp-size-btn')
              sizeButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  
                  const size = button.getAttribute('data-size')
                  if (size !== imageStore.imageSize) {
                    imageStore.imageSize = size
                    
                    // Update button styles
                    sizeButtons.forEach(btn => {
                      const btnSize = btn.getAttribute('data-size')
                      if (btnSize === size) {
                        btn.style.borderColor = 'darkorange'
                        btn.style.color = 'darkorange'
                      } else {
                        btn.style.borderColor = '#888'
                        btn.style.color = '#aaa'
                      }
                    })
                    
                    imageStore.updateImageSources()
                  }
                }, true)
              })

              // Attach delete button handler
              const deleteBtn = el.querySelector('.pswp-delete-btn')
              if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  try {
                    const ps = pswp
                    const idx = typeof ps.currIndex !== 'undefined' ? ps.currIndex : (ps.getCurrentIndex ? ps.getCurrentIndex() : 0)
                    const ds = ps.options.dataSource || []
                    const item = ds[idx] || {}
                    const path = item.alt || item.src || ''

                    // path is expected as: {day}/{filename}
                    let day = null
                    let filename = path
                    if (path && path.includes('/')) {
                      const parts = path.split('/')
                      day = parts[0]
                      filename = parts.slice(1).join('/')
                    } else {
                      day = imageStore.selectedDay
                    }

                    const capture_set_id = Alpine.store('app').currentCaptureSetId
                    const plot_type = Alpine.store('grid').plotType || 'waterfall'

                    if (!capture_set_id || !day || !filename) {
                      Alpine.store('app').showToast('Unable to determine recording to delete', 'error')
                      return
                    }

                    if (!confirm('Delete this recording and its metadata? This cannot be undone.')) return

                    const body = {
                      capture_set_id: capture_set_id,
                      day: day,
                      plot_type: plot_type,
                      filename: filename,
                      delete_raw: true
                    }

                    const resp = await fetch('/delete_recording', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body)
                    })

                    if (!resp.ok) {
                      const t = await resp.text()
                      Alpine.store('app').showToast('Failed to delete recording: ' + resp.status + ' ' + t, 'error')
                      return
                    }

                    Alpine.store('app').showToast('Recording deleted', 'success')

                    // Refresh metadata and images in lightbox
                    await imageStore.reloadImagesForCurrentDay()
                    // Also refresh grid store so UI updates
                    try { Alpine.store('grid').getData() } catch (e) {}

                  } catch (err) {
                    console.error('Delete failed', err)
                    Alpine.store('app').showToast('Delete failed: ' + err.message, 'error')
                  }
                }, true)
              }
            }
          })
        })
        
        // Prevent closing on background click
        this.lightbox.on('bgClickAction', (e) => {
          e.preventDefault()
        })
        
        // Prevent closing on image click/tap
        this.lightbox.on('tapAction', (e) => {
          e.preventDefault()
        })
        
        // Update actual dimensions when image loads
        this.lightbox.on('contentLoad', (e) => {
          const content = e.content
          if (content.type === 'image' && content.element) {
            const img = content.element
            if (img.complete) {
              content.width = img.naturalWidth
              content.height = img.naturalHeight
            } else {
              img.onload = () => {
                content.width = img.naturalWidth
                content.height = img.naturalHeight
                content.onLoaded()
              }
            }
          }
        })
        
        // Prevent PhotoSwipe from going beyond bounds (prevents blank images)
        this.lightbox.on('beforeChange', (e) => {
          const pswp = this.lightbox.pswp
          const nextIndex = e.currIndex
          const totalSlides = pswp.getNumItems()
          
          // Prevent going before first image
          if (nextIndex < 0) {
            e.preventDefault()
            pswp.goTo(0)
            return
          }
          
          // Prevent going after last image
          if (nextIndex >= totalSlides) {
            e.preventDefault()
            pswp.goTo(totalSlides - 1)
            return
          }
        })
        
        // Auto-transition to adjacent day when reaching boundaries
        this.lightbox.on('change', () => {
          this.handleDayBoundaryTransition()
        })
        
        // Add keyboard support for day navigation (especially useful with single images)
        this.lightbox.on('init', () => {
          const imageStore = Alpine.store('image')
          
          // Custom keyboard handler for day navigation
          const keydownHandler = async (e) => {
            const totalSlides = this.lightbox.pswp.getNumItems()
            const currIndex = this.lightbox.pswp.currIndex
            
            // Left arrow at first image (newest): go to next day (newer)
            if (e.key === 'ArrowLeft' && currIndex === 0 && imageStore.canNavigateToNextDay()) {
              e.preventDefault()
              e.stopPropagation()
              
              if (!imageStore.isLoadingAdjacentDay) {
                console.log('⌨️ Keyboard: Next day (newer)')
                imageStore.isLoadingAdjacentDay = true
                
                try {
                  await imageStore.navigateToNextDay()
                  const formattedDate = Alpine.store('grid').formatDay(imageStore.selectedDay)
                  Alpine.store('app').showToast('', 'info', formattedDate, 200000)
                  
                  // Go to last image (oldest) of next day for chronological continuity
                  if (imageStore.lightbox && imageStore.lightbox.pswp) {
                    const newTotalSlides = imageStore.lightbox.pswp.getNumItems()
                    imageStore.lightbox.pswp.goTo(newTotalSlides - 1)
                  }
                } catch (error) {
                  console.error('Error navigating to next day:', error)
                } finally {
                  imageStore.isLoadingAdjacentDay = false
                }
              }
            }
            
            // Right arrow at last image (oldest): go to previous day (older)
            else if (e.key === 'ArrowRight' && currIndex === totalSlides - 1 && imageStore.canNavigateToPreviousDay()) {
              e.preventDefault()
              e.stopPropagation()
              
              if (!imageStore.isLoadingAdjacentDay) {
                console.log('⌨️ Keyboard: Previous day (older)')
                imageStore.isLoadingAdjacentDay = true
                
                try {
                  await imageStore.navigateToPreviousDay()
                  const formattedDate = Alpine.store('grid').formatDay(imageStore.selectedDay)
                  Alpine.store('app').showToast('', 'info', formattedDate, 200000)
                  
                  // Go to first image (newest) of previous day for chronological continuity
                  if (imageStore.lightbox && imageStore.lightbox.pswp) {
                    imageStore.lightbox.pswp.goTo(0)
                  }
                } catch (error) {
                  console.error('Error navigating to previous day:', error)
                } finally {
                  imageStore.isLoadingAdjacentDay = false
                }
              }
            }
          }
          
          // Attach keyboard listener
          document.addEventListener('keydown', keydownHandler, true)
          
          // Clean up on close
          this.lightbox.on('destroy', () => {
            document.removeEventListener('keydown', keydownHandler, true)
          })
        })
        
        this.lightbox.init()
        this.lightbox.loadAndOpen(startIndex) // Open at specified index
      } catch (error) {
        console.error('Error initializing PhotoSwipe:', error)
        Alpine.store('app').showToast('Error opening image viewer: ' + error.message, 'error')
      }
    },
    
    // Handle automatic day transition at boundaries
    async handleDayBoundaryTransition() {
      if (this.isLoadingAdjacentDay) return
      if (!this.lightbox || !this.lightbox.pswp) return
      
      const pswp = this.lightbox.pswp
      const currIndex = pswp.currIndex
      const totalSlides = pswp.getNumItems()
      const lastIndex = this.lastIndexViewed
      
      // Validate bounds
      if (currIndex < 0 || currIndex >= totalSlides) {
        console.warn('Invalid index detected:', currIndex, 'total:', totalSlides)
        return
      }
      
      // Clear any existing debounce timer
      if (this.transitionDebounceTimer) {
        clearTimeout(this.transitionDebounceTimer)
        this.transitionDebounceTimer = null
      }
      
      // Automatic scroll-based day transitions are disabled to prevent false triggers
      // Use keyboard arrow keys or Day +/- buttons to navigate between days
      // (Automatic transitions were too sensitive and triggered during normal navigation)
      
      // Update last viewed index (only if valid)
      if (currIndex >= 0 && currIndex < totalSlides) {
        this.lastIndexViewed = currIndex
      }
    },
    
    // Close and cleanup
    close() {
      this.selectedDay = null
      
      // Clear debounce timer
      if (this.transitionDebounceTimer) {
        clearTimeout(this.transitionDebounceTimer)
        this.transitionDebounceTimer = null
      }
      
      if (this.lightbox) {
        try {
          this.lightbox.destroy()
        } catch (e) {
          // Ignore
        }
        this.lightbox = null
      }
    }
  })
})
