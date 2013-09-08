/**
 * @file Holds all CNC Server watercolorbot specific configuration
 */

cncserver.wcb = {

  // Move through every path element inside a given context
  // and match its stroke and fill color to a given colorset
  autoColor: function(context, recover){
    $('path', context).each(function(){
      var i = 0;
      var c = cncserver.config.colors;
      var setColor = "";

      if ($(this).css('fill') !== "none") {
        if (!recover) {
          // Find the closest color
          setColor = $(this).css('fill');
          $(this).data('oldColor', setColor);
          i = cncserver.utils.closestColor(setColor);
          setColor = 'rgb(' + c[i].join(',') + ')';
        } else {
          // Recover the old color
          setColor = $(this).data('oldColor');
        }

        // Set the new color!
        $(this).css('fill', setColor)
      }

      if ($(this).css('stroke') !== "none") {
        if (!recover) {
          // Find the closest color
          setColor = $(this).css('stroke');
          $(this).data('oldStrokeColor', setColor);
          i = cncserver.utils.closestColor(setColor);
          setColor = 'rgb(' + c[i].join(',') + ')';
        } else {
          // Recover the old color
          setColor = $(this).data('oldStrokeColor');
        }

        // Set the new color!
        $(this).css('stroke', setColor)
      }
    });
  },

  // Grouping function to do a full wash of the brush
  fullWash: function(callback) {
    cncserver.utils.status('Doing a full brush wash...');
    cncserver.api.tools.change('water0', function(){
      cncserver.api.tools.change('water1', function(){
        cncserver.api.tools.change('water2', function(d){
          cncserver.api.pen.resetCounter();
          cncserver.utils.status(['Brush should be clean'], d);
          if (callback) callback(d);
        });
      });
    });
  },

  // Get the name of paint/water/media on the brush
  getMediaName: function(toolName) {
    if (typeof toolName == 'undefined') toolName = cncserver.state.color;

    if (toolName.indexOf('water') !== -1) {
      return "Water";
    } else {
      var colors = cncserver.statedata.colorsets[cncserver.settings.colorset].colors;
      return colors[toolName.substr(-1, 1)];
    }
  },

  // Wet the brush and get more of selected paint color, then return to
  // point given and trigger callback
  getMorePaint: function(point, callback) {
    var name = cncserver.wcb.getMediaName().toLowerCase();

    cncserver.utils.status('Going to get some more ' + name + '...')
    cncserver.api.tools.change('water0dip', function(d){
      cncserver.api.tools.change(cncserver.state.color, function(d){
        cncserver.api.pen.resetCounter();
        cncserver.api.pen.up(function(d){
          cncserver.api.pen.move(point, function(d) {
            cncserver.utils.status(['Continuing to paint with ' + name]);
            if (callback) callback(d);
          });
        });
      });
    });
  },

  // Returns a list of the current colorset, sorted by luminosty, or Y value
  sortedColors: function() {
    var colorsort = [];

    // Use JS internal sort by slapping a zero padded value into an array
    $.each(cncserver.config.colorsYUV, function(index, color){
      if (index != 8) { // Ignore white
        colorsort.push(cncserver.utils.pad(color[0], 3) + '|' + 'color' + index);
      }
    });
    colorsort.sort().reverse();

    // Now extract the luminostiy from the array, and leave a clean list of colors
    for(var i in colorsort){
      colorsort[i] = colorsort[i].split('|')[1];
    }

    return colorsort;
  },

  // Move through all paths in a given context, pull out all jobs and begin to
  // Push them into the buffer
  autoPaint: function(context, callback) {
     // Clear all selections
    $('path.selected', context).removeClass('selected');

    // Make sure the colors are ready
    $('#auto-color:not(.undo)').click();

    // Holds all jobs keyed by color
    var jobs = {};
    var colorMatch = cncserver.utils.closestColor;
    var convert = cncserver.utils.colorStringToArray;

    $('path', context).each(function(){
      var $p = $(this);
      var stroke = convert($p.css('stroke'));
      var fill = convert($p.css('fill'));

      // Occasionally, these come back undefined
      stroke = (stroke == null) ? false : 'color' + colorMatch(stroke);
      fill = (fill == null) ? false : 'color' + colorMatch(fill);

      // Account for fill/stroke opacity
      var op = $p.css('fill-opacity');
      if (typeof op != 'undefined') fill = (op < 0.5) ? false : fill;

      op = $p.css('stroke-opacity');
      if (typeof op != 'undefined') stroke = (op < 0.5) ? false : stroke;

      // Don't actually fill or stroke for white... (color8)
      if (fill == 'color8') fill = false;
      if (stroke == 'color8') stroke = false;

      // Add fill (and fill specific stroke) for path
      if (fill) {
        // Initialize the color job object as an array
        if (typeof jobs[fill] == 'undefined') jobs[fill] = [];

        // Give all non-stroked filled paths a stroke of the same color first
        if (!stroke) {
          jobs[fill].push({t: 'stroke', p: $p});
        }

        // Add fill job
        jobs[fill].push({t: 'fill', p: $p});
      }

      // Add stroke for path
      if (stroke) {
        // Initialize the color job object as an array
        if (typeof jobs[stroke] == 'undefined') jobs[stroke] = [];

        jobs[stroke].push({t: 'stroke', p: $p});
      }
    });

    var sortedColors = cncserver.wcb.sortedColors();

    var finalJobs = [];

    $.each(sortedColors, function(i, c){
      if (typeof jobs[c] != 'undefined'){
        var topPos = finalJobs.length;
        for(j in jobs[c]){
          var out = {
            c: c,
            t: jobs[c][j].t,
            p: jobs[c][j].p
          };

          // Place strokes ahead of fills, but retain color order
          if (out.t == 'stroke') {
            finalJobs.splice(topPos, 0, out);
          } else {
            finalJobs.push(out);
          }

        }
      }
    });


    cncserver.utils.status('Auto Paint: ' +
      $('path', context).length + ' paths, ' +
      finalJobs.length + ' jobs');

    // Nothing manages color during automated runs, so you have to hang on to it
    var runColor = cncserver.state.color;

    var jobIndex = 0;
    doNextJob();

    function doNextJob() {
      var job = finalJobs[jobIndex];
      var run = cncserver.cmd.run;

      if (job) {
        // Make sure the color matches, full wash and switch colors!
        if (runColor != job.c) {
          run(['wash', ['tool', job.c]]);
          runColor = job.c;
        }

        cncserver.utils.addShortcuts(job.p);

        // Clear all selections at start
        $('path.selected', context).removeClass('selected');

        if (job.t == 'stroke'){
          job.p.addClass('selected');
          run([['status', 'Drawing path ' + job.p[0].id + ' stroke...']]);
          cncserver.paths.runOutline(job.p, function(){
            jobIndex++;
            job.p.removeClass('selected'); // Deselect now that we're done
            doNextJob();
          })
        } else if (job.t == 'fill') {
          run([['status', 'Drawing path ' + job.p[0].id + ' fill...']]);

          function fillCallback(){
            jobIndex++;
            doNextJob();
          }

          cncserver.paths.runFill(job.p, fillCallback);
        }
      } else {
        if (callback) callback();
        run(['wash','park']);
        // Done!
      }
    }
  },

  // Simulation draw of current buffer
  simulateBuffer: function() {
    var c = $('#sim')[0];
    var ctx = c.getContext("2d");
    // Clear sim canvas
    c.width = c.width;

    // Set stroke color
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 4;

    var doDraw = false;
    console.log('Start draw, buffer:', cncserver.state.buffer.length);

    // Move through every item in the command buffer
    for (var i in cncserver.state.buffer) {
      var next = cncserver.state.buffer[i];

      // Ensure it's an array
      if (typeof next == "string"){
        next = [next];
      }

      // What's the command?
      switch (next[0]) {
        case 'down':
          doDraw = false;
          //ctx.beginPath();
          break;
        case 'up':
          //ctx.closePath();
          doDraw = true;
          break;
        case 'move':
          // Add 48 to each side for 1/2in offset
          var x = next[1].x + 48; //(next[1].x / cncserver.canvas.width) * c.width;
          var y = next[1].y + 48; //(next[1].y / cncserver.canvas.height) * c.height;

          if (doDraw) {
            ctx.lineTo(x, y);
          } else {
            ctx.moveTo(x, y);
          }

          //ctx.lineTo(x, y);
          break;
      }
    }
    ctx.stroke();
    $('#sim').show();
    console.log('Simulation draw done!');

  },

  // Retrieve a fill path depending on config
  getFillPath: function(options){
    var ft = options.filltype;
    if (ft == 'tsp') {
      return $('#fill-spiral');
    } else {
      return $('#fill-' + ft);
    }
  }
};
