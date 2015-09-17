/*
 * @file exports a function for rendering Hersheytext onto a PaperScope Layer.
 */

var hershey = window.hershey ? window.hershey : require('hersheytext');

// Render HersheyText to a PaperScope canvas
module.exports = function(paper) {
  var Point = paper.Point;
  var Group = paper.Group;
  var CompoundPath = paper.CompoundPath;
  var view = paper.view;

  var chars = new Group();

  paper.renderText = function(text, options) {
    // Mesh in option defaults
    options = $.extend({
      spaceWidth: 15,
      strokeWidth: 2,
      strokeColor: 'black',
      charSpacing: 3,
      lineHeight: 15,
      hCenter: 0,
      vCenter: 0,
      textAlign: 'left'
    }, options);

    if (options.layer) {
      options.layer.activate();
    }

    var t = hershey.renderTextArray(text, options);
    var caretPos = new Point(0, 50);

    chars.remove()
    chars = new Group(); // Hold output lines groups

    var lines = [new Group()]; // Hold chars in lines
    var cLine = 0;
    _.each(t, function(char, index){
      if (char.type === "space") {
        caretPos.x+= options.spaceWidth

        // Allow line wrap on space
        if (caretPos.x > options.wrapWidth) {
          caretPos.x = 0;
          caretPos.y += options.lineHeight;

          cLine++;
          lines.push(new Group());
        }
      } else {
        lines[cLine].addChild(new CompoundPath({
          strokeWidth: options.strokeWidth,
          strokeColor: options.strokeColor,
          pathData: char.d,
          data: {
            d: char.d,
            char: char.type,

            // Structure for paper.utils.autoPaint
            color: paper.utils.snapColorID(new paper.Color(options.strokeColor)),
            name: 'letter-' + char.type + ' - ' + index + '-' + cLine,
            type: 'stroke'
          }
        }));
        var c = lines[cLine].lastChild;
        var b = c.bounds;

        c.pivot = new Point(0, 0);
        c.position = caretPos;
        caretPos.x += b.width + options.charSpacing;
      }
    });

    chars.addChildren(lines);
    chars.position = view.center.add(new Point(options.hCenter, options.vCenter));
    chars.scale(options.scale);

    // Align the lines
    if (options.textAlign === 'center') {
      _.each(lines, function(line) {
        line.position.x = chars.position.x;
      });
    } else if (options.textAlign === 'right') {
      _.each(lines, function(line) {
        line.pivot = new Point(line.bounds.width, line.bounds.height/2);
        line.position.x = chars.bounds.width;
      });
    }
  }

};
