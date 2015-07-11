/**
 * @file Holds all RoboPaint crosshatch mode initialization code.
 */

robopaintRequire(['superdom', 'svgshared', 'utils', 'wcb', 'commander'],
function($, robopaint, cncserver) {

  // We don't ever check visibility/overlap for this mode
  cncserver.config.checkVisibility = false;

// On page load complete...
$(function() {
  // Fit the canvas and other controls to the screen size
  responsiveResize();
  setTimeout(responsiveResize, 500);
  $(window).resize(responsiveResize);

  var $c = $('canvas');
  var ctx = $c[0].getContext('2d');
  var img = $('img')[0];

  // Scale image to fit
  var imgW = 1056;
  var imgH = 816;
  //ctx.drawImage(img, 0, 0, imgW, imgH);
  ctx.drawImage(img, 0, 0);

  // Save a copy of the image data so we don't have to keep redrawing it.
  var imageDataSrc = ctx.getImageData(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
  var imageDataOut = ctx.getImageData(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);

  // Externally accessible bind controlls trigger for robopaint.mode.svg to call
  window.bindControls = function() {
    // Bind for input slide.
    $('input[type=range]').bind('input', function(){
      var t = parseInt($('#thresh-main').val());
      threshold(t - parseInt($('#thresh-0').val()), ctx);
      threshold(t - parseInt($('#thresh-1').val()), $c[1].getContext('2d'));
      threshold(t + parseInt($('#thresh-2').val()), $c[2].getContext('2d'));
    }).trigger('input');

    // Range input slide "drop".
    $('input').change(function() {
      $('svg #target .renderpath').remove();

      runLineFill({
        fillangle: 0,
        fillprecision: 5,
        fillspacing: 5,
        ctx: $c[2].getContext('2d')
      });

      runLineFill({
        fillangle: 45,
        fillprecision: 5,
        fillspacing: 5,
        ctx: $c[1].getContext('2d')
      });

      runLineFill({
        fillangle: 90,
        fillprecision: 5,
        fillspacing: 5,
        ctx: ctx
      });
    });

    $('#save').click(function() {
      cncserver.canvas.saveSVG($('#export').html());
    });
  }

  // Externally accessible event for when the mode is translated (can be called
  // multiple times during a session, for every language change)
  window.translateComplete = function() {

  };


  function threshold(t, ctx) {
    // Loop over each pixel and invert the color.
    var pix = imageDataOut.data;
    var src = imageDataSrc.data;
    for (var i = 0, n = pix.length; i < n; i += 4) {

      // Average colors to compare BW threshold
      var c = (src[i] + src[i+1] + src[i+2]) / 3;
      c = c >= t ? 255 : 0;

      pix[i  ] = c; // red
      pix[i+1] = c; // green
      pix[i+2] = c; // blue
      // i+3 is alpha (the fourth element)
    }

    // Draw the ImageData at the given (x,y) coordinates.
    ctx.putImageData(imageDataOut, 0, 0);
  }

  function getPointCollide(point, imageData) {
    var index = (Math.round(point.y)*(imageData.width*4)) + (Math.round(point.x)*4);
    try {
      return imageData.data[index] === 0 && imageData.data[index+3] > 128;
    } catch(e) {
      return false;
    }
  }

 function runLineFill (options, callback) {
    var $fill = $('#fill-line-straight');
    var pathRect = {x: 0, y:0, height: 816, width: 1056};
    var fillType = $fill.attr('id').split('-')[2];
    var isLinear = (fillType == 'straight');
    var ctx = options.ctx;
    var imageData = ctx.getImageData(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);

    $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);
    $fill.getPoint = function(distance){ // Handy helper function for gPAL
      var p = this[0].getPointAtLength(distance).matrixTransform(this.transformMatrix);
      return {x: p.x, y: p.y};
    };

    // Sanity check incoming angle to match supported angles
    if (options.fillangle != 0 && options.fillangle !=90) {
      options.fillangle = options.fillangle == 45 ? -45 : 0;
    }

    options.fillprecision = parseInt(options.fillprecision);

    var linePos = 0;
    var lineIteration = 0;
    var lastPointChecked = {};
    var p = {};
    var max = $fill[0].getTotalLength();
    var goRight = true;
    var gapConnectThreshold = options.fillprecision * 3;
    var done = false;
    var leftOffset = 0;
    var topOffset = 0;
    var bottomLimit = 0;
    var waiting = false;
    var d = "M"; // Output Path
    var fillOffsetPadding = options.fillprecision;

    // Offset calculation for non-flat angles
    // TODO: Support angles other than 45
    if (options.fillangle == -45) {
      var rads = (Math.abs(options.fillangle)/2) * Math.PI / 180
      topOffset = (pathRect.height / 2) + 48;
      leftOffset = (Math.tan(rads) * (pathRect.height * 1.2))-48;

      bottomLimit = Math.tan(rads) * (pathRect.width * 1.2) + 48;
    }

    // Start fill position at path top left (less fill offset padding)
    $fill.attr('transform', 'translate(' + (pathRect.x - fillOffsetPadding - leftOffset) +
      ',' + (pathRect.y - fillOffsetPadding + topOffset) + ') rotate(' + options.fillangle + ')');

    while(!done) {
      linePos+= options.fillprecision;

      var shortcut = false;

      // Shortcut ending a given line check based on position (45deg) ==========
      if (options.fillangle == -45 && false) {
        // Line has run away up beyond the path
        if (goRight && p.y < pathRect.y - fillOffsetPadding) {
          shortcut = true;
          console.log('line #' + lineIteration + ' up shortcut!');
        }
      }

      // Shortcut ending a given line check based on position (vertical) =======
      if (options.fillangle == 90) {
        // Line has run away down beyond the BBox
        if (goRight && p.y > pathRect.y + pathRect.height) {
          shortcut = true;
        }

        // Line is too far right
        if (p.x > pathRect.x + pathRect.width) {
          shortcut = true;
        }

      }

      // Shortcut ending a given line check based on position (horizontal) =====
      if (options.fillangle == 0) {
        // Line has run away down beyond the BBox
        if (goRight && p.x > pathRect.x + pathRect.width) {
          shortcut = true;
        }

        // Line is beyond the bottom
        if (p.y > pathRect.y + pathRect.height) {
          shortcut = true;
        }
      }


      // If we've used up this line, move on to the next one!
      if (linePos > max || shortcut) {
        lineIteration++; // Next line! Move it to the new position

        var lineSpaceAmt = options.fillspacing * lineIteration;

        // Move down
        var lineSpace = {
          x: 0,
          y: lineSpaceAmt
        }

        // TODO: Support angles other than 45 & 90
        if (options.fillangle == -45) {
          // Move down and right
          lineSpace = {
            x: (options.fillspacing/2) * lineIteration,
            y: (options.fillspacing/2) * lineIteration
          }
        } else if (options.fillangle == 90) {
          // Move right
          lineSpace = {
            x: lineSpaceAmt,
            y: 0
          }
        }

        var fillOrigin = {
          x: pathRect.x + lineSpace.x - fillOffsetPadding - leftOffset,
          y: pathRect.y + lineSpace.y - fillOffsetPadding + topOffset
        };

        if (fillOrigin.y > pathRect.y + pathRect.height + bottomLimit + 24 ||
            fillOrigin.x > pathRect.x + pathRect.width - leftOffset + 24 ) {
          done = true;
        } else {
          // Set new position of fill line, and reset counter
          $fill.attr('transform', 'translate(' + fillOrigin.x + ',' + fillOrigin.y + ') rotate(' + options.fillangle + ')');
          $fill.transformMatrix = $fill[0].getTransformToElement($fill[0].ownerSVGElement);

          linePos = 0;
          goRight = !goRight;
        }
      }

      // Reverse direction? Simply invert the value!
      var lineGet = goRight ? linePos : max - linePos;

      // Go and get the x,y for the position on the line
      p = $fill.getPoint(lineGet);


      // If the path is still visible here, assume it's not for now
      var isVisible = false;

      // Is the point within the bounding box of the path to be filled?
      if ((p.x >= pathRect.x && p.y >= pathRect.y) &&
          (p.x < pathRect.x + pathRect.width && p.y < pathRect.y + pathRect.height)) {
          isVisible = true;
      }

      // Only if we've passed previous checks should we run the expensive
      // getPointPathCollide function
      if (isVisible){
        isVisible = getPointCollide(p, imageData);
        //setPixel(p, options.ctx, isVisible);
      }

      if (isVisible){ // Path is visible at this position!

        // If we were waiting...
        if (waiting) {
          waiting = false;

          // Find out how far away we are now...
          var diff = robopaint.utils.getDistance(lastPointChecked, p);

          // If we're too far away, lift the pen, then move to the position, then come down
          if (diff > gapConnectThreshold || isNaN(diff)) {
            d+= 'M' + p.x + ',' + p.y + ' ';
          } else { // If we're close enough, just move to the new point
            d+= p.x + ',' + p.y + ' ';
          }

        } else { // Still visible, just keep moving
          // Only log the in-between moves if it's non-linear
          if (!isLinear) {
            d+= p.x + ',' + p.y + ' ';
          }
        }

      } else { // Path is invisible, lift the brush if we're not already waiting
        if (!waiting) {
          d+= p.x + ',' + p.y + ' ';
          waiting = true;

          // Save the point that we looked at to check later.
          lastPointChecked = {x:p.x, y:p.y};
        }
      }
    }

    // Reset position of fill line (avoids odd prefill lines)
    $fill.attr('transform', 'translate(0,0)');
    if (callback) callback();
    $('<svg:path/>')
      .attr('d', d)
      .attr('stroke', 'black')
      .attr('stroke-width', '1')
      .attr('fill', 'none')
      .attr('class', 'renderpath')
      .appendTo('svg #target');
  }

  function setPixel(point, ctx, isVis) {
    var c = "rgba("+255+","+0+","+0+","+(255/255)+")";
    if (isVis) {
      c = "rgba("+0+","+255+","+0+","+(255/255)+")"
    }
    ctx.fillStyle = c;
    ctx.fillRect(point.x, point.y, 1, 1);
  }

  // Externalize for remote triggering
  window.responsiveResize = responsiveResize;
  function responsiveResize(){
    var w = $(window).width();
    var h = $(window).height();

    // These value should be static, set originally from central canvas config
    var mainOffset = {
      top: 300,
      left: 30,
      bottom: 20,
      right: $('#control').width() + 50
    };

    // Calculate scale for both width and height...
    var scale = {
      x: (w - (mainOffset.left + mainOffset.right)) / cncserver.canvas.width,
      y: (h - (mainOffset.top + mainOffset.bottom)) / cncserver.canvas.height
    }

    // ...use the smaller of the two
    cncserver.canvas.scale = scale.x < scale.y ? scale.x : scale.y;

    $('#scale-container') // Actually do the scaling
      .css('-webkit-transform', 'scale(' + cncserver.canvas.scale + ')');

    cncserver.canvas.offset.left = mainOffset.left+1;
    cncserver.canvas.offset.top = mainOffset.top+1;

    // Scale the Canvases
    $('canvas').each(function(){
      var previewWidth = (w - 440) / 3; // Space available for each canvas
      var s = previewWidth / cncserver.canvas.width
      $(this)
        .css('-webkit-transform', 'scale(' + s + ')')
        .parent().css('width', previewWidth);
    });


  }

}); // End Page load complete

}); // End RequireJS init
