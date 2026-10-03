/*jshint maxerr: 1000 */
// Get the browser's window's height and width

//prevent backspace from exiting the window
window.addEventListener('keydown',function(e){if(e.keyIdentifier=='U+0008'||e.keyIdentifier=='Backspace'){if(e.target==document.body){e.preventDefault();}}},true);


var width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
var height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
var drawingBoardWidth = 900;
var drawingBoardHeight = 445;
var originXvalue = Number((0.1 * drawingBoardWidth).toFixed(3));
var originYvalue = Number((0.85 * drawingBoardHeight).toFixed(3));

//create a svg element called 'draw' and create a black edge for it
var draw = SVG('drawing').size(drawingBoardWidth, drawingBoardHeight).spof();
var edgeCoordinates = '0,0 ' + '0,' + drawingBoardHeight + ' ' + drawingBoardWidth + ',' + drawingBoardHeight + ' ' + drawingBoardWidth + ',0';
SVG.on(window, 'resize', function() {draw.spof();}); //to resize the svg when window is resized

var polygon = draw.polygon(edgeCoordinates).fill('none').stroke({width: 1}); //black edge
var scaleBottomLine = draw.line(15,20,40,20).stroke({width: 1}).addClass("notMember");
var scaleLeftLine = draw.line(15,21,15,10).stroke({width:1}).addClass("notMember");
var scaleLeftLine = draw.line(40,21,40,10).stroke({width:1}).addClass("notMember");
var scaleNumber = draw.text("25px").move(17,8).font({size:9});

var origin = draw.circle(4).move(originXvalue - 2, originYvalue - 2).stroke({width: 6,opacity: 0,color: "black"}); //The origin dot
var originId = origin.node.getAttribute('id');
//The six variables below define the two lines that represent X and Y axis and the two little black arrows
var originLineLength = Number((drawingBoardWidth * 0.05).toFixed(3));
var originArrowLength = drawingBoardWidth * 0.006;
var originXaxis = draw.line(originXvalue, originYvalue, originXvalue + originLineLength, originYvalue).stroke({width: 1}).back().addClass("notMember");
var originYaxis = draw.line(originXvalue, originYvalue, originXvalue, originYvalue - originLineLength).stroke({width: 1}).back().addClass("notMember");
var originXaxisArrowArray = (originXvalue + originLineLength) + ',' + (originYvalue + originArrowLength) + ' ' + (originXvalue + originLineLength + originArrowLength) + ',' + originYvalue + ' ' + (originXvalue + originLineLength) + ',' + (originYvalue - originArrowLength);
var originXaxisArrow = draw.polygon(originXaxisArrowArray);
var originYaxisArrowArray = (originXvalue + originArrowLength) + ',' + (originYvalue - originLineLength) + ' ' + (originXvalue) + ',' + (originYvalue - originLineLength - originArrowLength) + ' ' + (originXvalue - originArrowLength) + ',' + (originYvalue - originLineLength);
var originYaxisArrow = draw.polygon(originYaxisArrowArray);

var scaleValue = document.getElementById("scaleInput").value;
var scaleSelection = document.getElementById("scaleSelect");
var scaleSelectedIndex =  scaleSelection.selectedIndex;
var scaleUnit = scaleSelection.options[scaleSelectedIndex].value;
var forceUnit;
var stressUnit;

var dependency = [];

drawInDom = document.getElementById('drawing');
drawingStartButton = document.getElementById('drawingStart');
var hitButton = 0;

// mouse position in drawing coordinates, works when the page is scaled to fit the window
function svgPoint(event){
  var rect = draw.node.getBoundingClientRect();
  return [Number(((event.clientX - rect.left) * drawingBoardWidth / rect.width).toFixed(3)),
          Number(((event.clientY - rect.top) * drawingBoardHeight / rect.height).toFixed(3))];
}

// scale the whole layout to fill the window width
function fitToWindow(){
  document.body.style.zoom = window.innerWidth / 1140;
}
fitToWindow();
window.addEventListener('resize', fitToWindow);

//return whether an element(in an array) is zero
function isZero(element, index, array) {
  return element === 0;
}


var allLoadArray = [];

//Core object: the data points and basic manipulations on them
var jointPoints = {
  points: [], //all data points
  links: [], //all links between data points
  sets: [],
  addPoint: function(jointXValue, jointYValue) { //1.Add the Circle 2.Add the link 3.Add the set dependency
    //Add points to the points array
    this.points.push({
      xValue: jointXValue,
      yValue: jointYValue,
      trussX: Number((jointXValue - originXvalue).toFixed(3)),
      trussY: Number((originYvalue - jointYValue).toFixed(3)),
      circle: draw.circle(7).move(jointXValue - 3.5, jointYValue - 3.5).stroke({width: 10, opacity: 0, color: "#19EA48"}).attr({fill: '#808080'}).draggable(),
      load: [0, 0, 0, 0],
      loadToRight: undefined,
      loadToLeft: undefined,
      loadToTop: undefined,
      loadToBottom: undefined,
      loadRightVD: undefined, //VD is short for value(text) display
      loadLeftVD: undefined,
      loadTopVD: undefined,
      loadBottomVD: undefined,
      support: undefined,
      supportDisplay: undefined
    });
    //draw the circle at the place when a point is added

    //Starting the second point, every time a point is added, a link between the new point and previous
    //point is added to links array and the line is drawn
    var secondLastPoint = this.points[this.points.length - 2];
    var lastPoint = this.points[this.points.length - 1];
    if (this.points.length > 1) {
      this.links.push({
        startCoordinates: [secondLastPoint.xValue, secondLastPoint.yValue],
        endCoordinates: [lastPoint.xValue, lastPoint.yValue],
        startTrussCoords: [secondLastPoint.trussX, secondLastPoint.trussY],
        endTrussCoords: [lastPoint.trussX, lastPoint.trussY],
        line: draw.line(secondLastPoint.xValue, secondLastPoint.yValue, lastPoint.xValue, lastPoint.yValue).stroke({width: 3}).back(),
        area:undefined,
        e:undefined
      });
      //If the link is the first link on a polyline, but not a first link on the first polyline, hide it
      if (this.points.length > 2 & hitButton === 0) {
        this.links[this.links.length - 1].line.hide();
      }
    }
  },
  changePoint: function(index, newJointXValue, newJointYValue) {
    newJointXValue = Number(newJointXValue.toFixed(3));
    newJointYValue = Number(newJointYValue.toFixed(3));
    this.points[index].xValue = newJointXValue;
    this.points[index].yValue = newJointYValue;
    this.points[index].trussX = Number((newJointXValue - originXvalue).toFixed(3));
    this.points[index].trussY = Number((originYvalue - newJointYValue).toFixed(3));
    this.points[index].circle.move(newJointXValue - 3.5, newJointYValue - 3.5);
    if (index > 0) { //change the line previous to the point 
      this.links[index - 1].endCoordinates = [newJointXValue, newJointYValue];
      this.links[index - 1].endTrussCoords = [Number((newJointXValue - originXvalue).toFixed(3)), Number((originYvalue - newJointYValue).toFixed(3))];
      this.links[index - 1].line.plot([[this.points[index - 1].xValue, this.points[index - 1].yValue],[newJointXValue, newJointYValue]]);
    }
    if (index < this.points.length - 1) { //change the line after the point
      this.links[index].startCoordinates = [newJointXValue, newJointYValue];
      this.links[index].startTrussCoords = [Number((newJointXValue - originXvalue).toFixed(3)), Number((originYvalue - newJointYValue).toFixed(3))];
      this.links[index].line.plot([[newJointXValue, newJointYValue],[this.points[index + 1].xValue, this.points[index + 1].yValue]]);
    }
    //move the load arrow with the point
    var arrowSideLength;
    if (this.points[index].load.every(isZero) === false) {
      var point = this.points[index];
      if (point.loadToRight !== undefined) {
        arrowSideLength = point.loadToRight.width();
        point.loadToRight.move((newJointXValue - arrowSideLength - 5), (newJointYValue - 0.5 * arrowSideLength));
        point.loadRightVD.move((newJointXValue - 1.5 * arrowSideLength), (newJointYValue - 0.5 * arrowSideLength));
      }
      if (point.loadToLeft !== undefined) {
        arrowSideLength = point.loadToLeft.width();
        point.loadToLeft.move((newJointXValue + 5), (newJointYValue - 0.5 * arrowSideLength));
        point.loadLeftVD.move((newJointXValue + 0.5 * arrowSideLength), (newJointYValue - 0.5 * arrowSideLength));
      }
      if (point.loadToTop !== undefined) {
        arrowSideLength = point.loadToTop.width();
        point.loadToTop.move((newJointXValue - 0.5 * arrowSideLength), (newJointYValue + 5));
        point.loadTopVD.move((newJointXValue + 0.3 * arrowSideLength), (newJointYValue + 0.5 * arrowSideLength));
      }
      if (point.loadToBottom !== undefined) {
        arrowSideLength = point.loadToBottom.width();
        point.loadToBottom.move((newJointXValue - 0.5 * arrowSideLength), (newJointYValue - arrowSideLength - 5));
        point.loadBottomVD.move((newJointXValue + 0.3 * arrowSideLength), (newJointYValue - arrowSideLength));
      }
    }
    //move the support with the point
    var supportType = this.points[index].support;
    if (typeof supportType != "undefined") {
      if (supportType === "rollerBottom") {
        this.points[index].supportDisplay.move((newJointXValue - 15), (newJointYValue));
      } else if (supportType === "rollerTop") {
        this.points[index].supportDisplay.move((newJointXValue - 15), (newJointYValue - 30));
      } else if (supportType === "rollerRight") {
        this.points[index].supportDisplay.move((newJointXValue), (newJointYValue - 15));
      } else if (supportType === "rollerLeft") {
        this.points[index].supportDisplay.move((newJointXValue - 30), (newJointYValue - 15));
      } else if (supportType === "pinned") {
        this.points[index].supportDisplay.move((newJointXValue - 18), (newJointYValue - 6));
      }
    }
  },
  deletePoint: function(index) { //Need further editing
    this.points[index].circle.remove();
    this.points.splice(index, 1);
  },
  deleteLink: function() {},

  addLoad: function(circleIndex, directionIndex, magnitude) {
    this.points[circleIndex].load[directionIndex] = magnitude;
    var arrowSideLength = 20;
    if (directionIndex === 0) {
      this.points[circleIndex].loadToRight =
        draw.image("arrow-pointing-to-right.svg")
        .move((this.points[circleIndex].xValue - arrowSideLength - 5), (this.points[circleIndex].yValue - 0.5 * arrowSideLength))
        .size(arrowSideLength, arrowSideLength).addClass("load");
      this.points[circleIndex].loadRightVD = draw.text(this.points[circleIndex].load[0].toString() + " lb")
        .move((this.points[circleIndex].xValue - arrowSideLength * 4), (this.points[circleIndex].yValue - arrowSideLength))
        .font({size: 14}).fill('red');
    } else if (directionIndex === 1) {
      this.points[circleIndex].loadToLeft =
        draw.image("arrow-pointing-to-left.svg")
        .move((this.points[circleIndex].xValue + 5), (this.points[circleIndex].yValue - 0.5 * arrowSideLength))
        .size(arrowSideLength, arrowSideLength).addClass("load");
      this.points[circleIndex].loadLeftVD = draw.text(this.points[circleIndex].load[1].toString() + " lb")
        .move((this.points[circleIndex].xValue + 2 * arrowSideLength), (this.points[circleIndex].yValue - arrowSideLength))
        .font({size: 14}).fill('red');
    } else if (directionIndex === 2) {
      this.points[circleIndex].loadToTop =
        draw.image("arrow-pointing-to-up.svg")
        .move((this.points[circleIndex].xValue - 0.5 * arrowSideLength), (this.points[circleIndex].yValue + 5))
        .size(arrowSideLength, arrowSideLength).addClass("load");
      this.points[circleIndex].loadTopVD = draw.text(this.points[circleIndex].load[2].toString() + " lb")
        .move((this.points[circleIndex].xValue + 0.5 * arrowSideLength), (this.points[circleIndex].yValue + 1.5 * arrowSideLength))
        .font({size: 14}).fill('red');
    } else {
      this.points[circleIndex].loadToBottom =
        draw.image("arrow-pointing-to-down.svg")
        .move((this.points[circleIndex].xValue - 0.5 * arrowSideLength), (this.points[circleIndex].yValue - arrowSideLength - 5))
        .size(arrowSideLength, arrowSideLength).addClass("load");
      this.points[circleIndex].loadBottomVD = draw.text(this.points[circleIndex].load[3].toString() + " lb")
        .move((this.points[circleIndex].xValue + arrowSideLength), (this.points[circleIndex].yValue - 1.5 * arrowSideLength))
        .font({size: 14}).fill('red');
    }
  },

  changeLoad: function(circleIndex, directionIndex, newMagnitude) {
    this.points[circleIndex].load[directionIndex] = newMagnitude;

  },

  deleteLoad: function(circleIndex, directionIndex) {
    this.points[circleIndex].load[directionIndex] = 0;
    if (directionIndex === 0) {
      this.points[circleIndex].loadToRight.hide();
      this.points[circleIndex].loadRightVD.hide();
      this.points[circleIndex].loadToRight = undefined;
      this.points[circleIndex].loadRightVD = undefined;
    } else if (directionIndex === 1) {
      this.points[circleIndex].loadToLeft.hide();
      this.points[circleIndex].loadLeftVD.hide();
      this.points[circleIndex].loadToLeft = undefined;
      this.points[circleIndex].loadLeftVD = undefined;
    } else if (directionIndex === 2) {
      this.points[circleIndex].loadToTop.hide();
      this.points[circleIndex].loadTopVD.hide();
      this.points[circleIndex].loadToTop = undefined;
      this.points[circleIndex].loadTopVD = undefined;
    } else if (directionIndex === 3) {
      this.points[circleIndex].loadToBottom.hide();
      this.points[circleIndex].loadBottomVD.hide();
      this.points[circleIndex].loadToBottom = undefined;
      this.points[circleIndex].loadBottomVD = undefined;
    }
  },

  addSupport: function(circleIndex, supportType) {
    if (supportType === "rollerBottom") {
      this.points[circleIndex].support = "rollerBottom";
      this.points[circleIndex].supportDisplay =
        draw.image("rollerSupportBottom.svg")
        .move((this.points[circleIndex].xValue - 15), (this.points[circleIndex].yValue))
        .size(30, 30).back().addClass("support rollerBottom");
    } else if (supportType === "rollerTop") {
      this.points[circleIndex].support = "rollerTop";
      this.points[circleIndex].supportDisplay =
        draw.image("rollerSupportTop.svg")
        .move((this.points[circleIndex].xValue - 15), (this.points[circleIndex].yValue - 30))
        .size(30, 30).back().addClass("support rollerTop");
    } else if (supportType === "rollerRight") {
      this.points[circleIndex].support = "rollerRight";
      this.points[circleIndex].supportDisplay =
        draw.image("rollerSupportRight.svg")
        .move((this.points[circleIndex].xValue), (this.points[circleIndex].yValue - 15))
        .size(30, 30).back().addClass("support rollerRight");
    } else if (supportType === "rollerLeft") {
      this.points[circleIndex].support = "rollerLeft";
      this.points[circleIndex].supportDisplay =
        draw.image("rollerSupportLeft.svg")
        .move((this.points[circleIndex].xValue - 30), (this.points[circleIndex].yValue - 15))
        .size(30, 30).back().addClass("support rollerLeft");
    } else if (supportType === "pinned") {
      this.points[circleIndex].support = "pinned";
      this.points[circleIndex].supportDisplay =
        draw.image("pinnedSupport.svg")
        .move((this.points[circleIndex].xValue - 18), (this.points[circleIndex].yValue - 6))
        .size(36, 36).back().addClass("support pinned");
    }
  },

  changeSupport: function(circleIndex, newSupportType) {
    this.points[circleIndex].support = newSupportType;
    this.points[circleIndex].supportDisplay.remove();
    if (newSupportType === "rollerBottom") {
      this.points[circleIndex].support = "rollerBottom";
      this.points[circleIndex].supportDisplay =
        draw.image("rollerSupportBottom.svg")
        .move((this.points[circleIndex].xValue - 15), (this.points[circleIndex].yValue))
        .size(30, 30).back().addClass("support rollerBottom");
    } else if (newSupportType === "rollerTop") {
      this.points[circleIndex].support = "rollerTop";
      this.points[circleIndex].supportDisplay =
        draw.image("rollerSupportTop.svg")
        .move((this.points[circleIndex].xValue - 15), (this.points[circleIndex].yValue - 30))
        .size(30, 30).back().addClass("support rollerTop");
    } else if (newSupportType === "rollerRight") {
      this.points[circleIndex].support = "rollerRight";
      this.points[circleIndex].supportDisplay =
        draw.image("rollerSupportRight.svg")
        .move((this.points[circleIndex].xValue), (this.points[circleIndex].yValue - 15))
        .size(30, 30).back().addClass("support rollerRight");
    } else if (newSupportType === "rollerLeft") {
      this.points[circleIndex].support = "rollerLeft";
      this.points[circleIndex].supportDisplay =
        draw.image("rollerSupportLeft.svg")
        .move((this.points[circleIndex].xValue - 30), (this.points[circleIndex].yValue - 15))
        .size(30, 30).back().addClass("support rollerLeft");
    } else if (newSupportType === "pinned") {
      this.points[circleIndex].support = "pinned";
      this.points[circleIndex].supportDisplay =
        draw.image("pinnedSupport.svg")
        .move((this.points[circleIndex].xValue - 18), (this.points[circleIndex].yValue - 6))
        .size(36, 36).back().addClass("support pinned");
    }
  },

  deleteSupport: function(circleIndex) {
    this.points[circleIndex].support = undefined;
    this.points[circleIndex].supportDisplay.hide();
    this.points[circleIndex].supportDisplay = undefined;
  }
};

var allLoadIdArray;
var allSupportIdArray;
var circleSelected;
var circleSelectedCount;
var lineSelected;

var sync = {
  scale: function(){
    scaleValue = document.getElementById("scaleInput").value;
    scaleSelectedIndex =  scaleSelection.selectedIndex;
    scaleUnit = scaleSelection.options[scaleSelectedIndex].value;
    scaleRatio = 25/scaleValue;
    if (scaleUnit ==="in"){
      forceUnit = "lb";
      stressUnit = "psi";
    } else if (scaleUnit ==="m"){
      forceUnit = "N";
      stressUnit === "Pa";
    }
  },
  dragPoint: function(event) { //constantly(when mousemove) use DOM circles coordinates to update the raw points' coord
    for (i = 0; i < jointPoints.points.length; i++) {
      newPointXvalue = jointPoints.points[i].circle.cx();
      newPointYvalue = jointPoints.points[i].circle.cy();
      jointPoints.changePoint(i, newPointXvalue, newPointYvalue);
    }
  },
  //Synchronize the coordinate values of the two circles in a set
  //also makes sure if the top circle is grey(unselected), the bottom circle is also grey(unselected)
  setValueSync: function() {
    jointPoints.sets.forEach(function(entry) {
      if (entry.set.members[1].node.getAttribute("cx") !== entry.setXvalue ||
        entry.set.members[1].node.getAttribute("cy") !== entry.setYvalue) {
        entry.set.members[0].node.setAttribute('cx', entry.set.members[1].node.getAttribute("cx"));
        entry.set.members[0].node.setAttribute('cy', entry.set.members[1].node.getAttribute("cy"));
        entry.setXvalue = entry.set.members[1].node.getAttribute("cx");
        entry.setYvalue = entry.set.members[1].node.getAttribute("cy");
      } else if (entry.set.members[0].node.getAttribute('cx') !== entry.setXvalue ||
        entry.set.members[0].node.getAttribute('cy') !== entry.setYvalue) {
        entry.set.members[1].node.setAttribute("cx", entry.set.members[0].node.getAttribute('cx'));
        entry.set.members[1].node.setAttribute("cy", entry.set.members[0].node.getAttribute('cy'));
        entry.setXvalue = entry.set.members[0].node.getAttribute('cx');
        entry.setYvalue = entry.set.members[0].node.getAttribute('cy');
      }
    });

  },
  loadDisplay: function() {
    allLoadArray = [];
    jointPoints.points.forEach(function(point) {
      point.load.forEach(function(each) {
        if (each !== 0) {
          allLoadArray.push(each);
        }
      });
    });

    allLoadIdArray = [];
    jointPoints.points.forEach(function(point) {
      if (typeof point.loadToRight !== "undefined") {
        allLoadIdArray.push(point.loadToRight.node.getAttribute('id'));
      } else {
        allLoadIdArray.push(undefined);
      }
      if (typeof point.loadToLeft !== "undefined") {
        allLoadIdArray.push(point.loadToLeft.node.getAttribute('id'));
      } else {
        allLoadIdArray.push(undefined);
      }
      if (typeof point.loadToTop !== "undefined") {
        allLoadIdArray.push(point.loadToTop.node.getAttribute('id'));
      } else {
        allLoadIdArray.push(undefined);
      }
      if (typeof point.loadToBottom !== "undefined") {
        allLoadIdArray.push(point.loadToBottom.node.getAttribute('id'));
      } else {
        allLoadIdArray.push(undefined);
      }
    });

    var maxLoad = Math.max.apply(null,allLoadArray);
    var minLoad = Math.min.apply(null, allLoadArray);
    var graphSlope = 50/(maxLoad - minLoad); 
    var loadSize;
    jointPoints.points.forEach(function(point) {
      if (point.load.every(isZero) === false) {
        point.load.forEach(function(oneLoad, index) {
          if (isZero(oneLoad) === false) {
            if (allLoadArray.length > 1) {
              loadSize = (oneLoad - minLoad)* graphSlope + 30;
            } else {
              loadSize = 80;
            }
            if (index === 0) {
              point.loadToRight.size(loadSize, loadSize);
              point.loadRightVD.text(oneLoad.toString() +" "+ document.getElementById("loadUnitSelect").value); //update the text that displays load
            } else if (index === 1) {
              point.loadToLeft.size(loadSize, loadSize);
              point.loadLeftVD.text(oneLoad.toString() + " "+ document.getElementById("loadUnitSelect").value);
            } else if (index === 2) {
              point.loadToTop.size(loadSize, loadSize);
              point.loadTopVD.text(oneLoad.toString() + " "+ document.getElementById("loadUnitSelect").value);
            } else if (index === 3) {
              point.loadToBottom.size(loadSize, loadSize);
              point.loadBottomVD.text(oneLoad.toString() + " "+ document.getElementById("loadUnitSelect").value);
            }
          }
        });
      }
    });
  },
  circleSelected: function() {
    circleSelectedCount = 0;
    jointPoints.points.forEach(function(each) {
      if (each.circle.node.getAttribute('fill') === 'red') {
        circleSelectedCount++;
        circleSelected = each;
      }
    });
    if (circleSelectedCount === 1) {
      document.getElementById("arrowheadNotice").innerHTML = "Now choose the direction of load:";
      document.getElementById("supportNotice").innerHTML = "Choose the support type or no support(X):";
    } else if (circleSelectedCount > 1) {
      document.getElementById("arrowheadNotice").innerHTML = "You selected more than one joint";
      document.getElementById("supportNotice").innerHTML = "You selected more than one joint";
      document.getElementById("xCoordInput").value = '';
      document.getElementById("yCoordInput").value = '';
    } else {
      document.getElementById("arrowheadNotice").innerHTML = "Select a joint to add load<br>Or click on a load to change it";
      document.getElementById("supportNotice").innerHTML = "Select a joint to add support<br>Or click on a support to change it";
      document.getElementById("xCoordInput").value = '';
      document.getElementById("yCoordInput").value = '';
    }
  },
  lineSelected: function(){
    lineSelected = [];
    jointPoints.links.forEach(function(line){
      if(line.line.node.getAttribute("stroke-width")==="6"){
        lineSelected.push(line);
      }
    });
  },
  supportId: function() {
    allSupportIdArray = [];
    jointPoints.points.forEach(function(point) {
      if (typeof point.support !== "undefined") {
        allSupportIdArray.push(point.supportDisplay.node.getAttribute("id"));
      } else {
        allSupportIdArray.push(undefined);
      }
    });
  }
};
//The intervals functions below runs every two milliseconds
var domToRawSync = window.setInterval(sync.dragPoint, 2); //This synchronizes DOM circle coords to jointPoints circle values
var setSync = window.setInterval(sync.setValueSync, 2); //This synchronizes the coords of the two circles in a set
var loadDisplaySync = window.setInterval(sync.loadDisplay, 2); //This synchronizes the size of load arrows
var supportIdSync = window.setInterval(sync.supportId, 2); //this synchronizes the allSupportId array
var circleSelectedSync = window.setInterval(sync.circleSelected, 2);
var lineSelectedSync = window.setInterval(sync.lineSelected,2);
var scaleSync = window.setInterval(sync.scale,2);

var movingLine = draw.line(0, 0, 1, 1).stroke({width: 3}).attr({ id: 'movingLine' }); //define the moving line so that it can be changed
var highlightLine = draw.line(0,0,1,1).stroke({width: 5}); //define the highlightLine so it can be moved to when member needs hightlights
var setDependency = false;
var circleIdArray = [];


var handlers = { //The methods here handles all direct interaction with the user

  drawPolyline: function(event) { //function to take mouse event and add a circle to the point clicked
    if (event.target.tagName === 'circle' && event.target.id !== originId) {
      jointX = event.target.getAttribute('cx');
      jointY = event.target.getAttribute('cy');
      jointPoints.addPoint(jointX, jointY);
      //jointPoints.points[jointPoints.points.length - 1].circle.draggable(); //Make the new added circle draggable
      setDependency = true;
    } else if (event.target.id === originId) {
      jointX = event.target.getAttribute('cx');
      jointY = event.target.getAttribute('cy');
      jointPoints.addPoint(jointX, jointY);
      //jointPoints.points[jointPoints.points.length - 1].circle.draggable(); //Make the new added circle draggable
      setDependency = false;
    } else if (event.target.tagName === "line"&&event.target.id!=="movingLine"){//put a node on a line
      event.target.instance.hide();//hide the line being hit
      jointX = svgPoint(event)[0];
      jointY = svgPoint(event)[1];
      jointPoints.addPoint(jointX, jointY);
      //jointPoints.points[jointPoints.points.length - 1].circle.draggable(); //Make the new added circle draggable
      hitButton++;
      setDependency = false;
      //create two new lines
      var x1 = Number(event.target.getAttribute("x1"));
      var y1 = Number(event.target.getAttribute("y1"));
      var x2 = Number(event.target.getAttribute("x2"));
      var y2 = Number(event.target.getAttribute("y2"));
      var firstCircle;
      var firstCircleIndex;
      var secondCircle;
      var secondCircleIndex;
      jointPoints.addPoint(x1, y1);
      var newCircleId = jointPoints.points[jointPoints.points.length - 1].circle.attr("id");
      jointPoints.points.forEach(function(point,index){// find the first circle of the hit line
        if(point.xValue == x1 && point.yValue==y1 && point.circle.attr("id")!==newCircleId){
          firstCircle = point.circle;
          firstCircleIndex = Number(index);
        }
      });
      jointPoints.sets.push({// set dependency of the left redundant circles
        set: draw.set().add(jointPoints.points[jointPoints.points.length - 1].circle, firstCircle),
        setXvalue: x1,
        setYvalue: y1
      });
      dependency.push(jointPoints.points.length - 1,firstCircleIndex);
      
      jointPoints.addPoint(jointX, jointY);//the invisible round way line
      jointPoints.links[jointPoints.links.length-1].line.hide();
      jointPoints.sets.push({// set dependency
        set: draw.set().add(jointPoints.points[jointPoints.points.length - 1].circle, jointPoints.points[jointPoints.points.length - 3].circle),
        setXvalue: jointX,
        setYvalue: jointY
      });
      dependency.push(jointPoints.points.length - 1,jointPoints.points.length - 3);
      
      jointPoints.addPoint(x2, y2);
      newCircleId = jointPoints.points[jointPoints.points.length - 1].circle.attr("id");
      jointPoints.points.forEach(function(point,index){// find the second circle of the hit line
        if(point.xValue == x2 && point.yValue==y2 && point.circle.attr("id")!==newCircleId ){
          secondCircle = point.circle;
          secondCircleIndex = Number(index);
        }
      });
      jointPoints.sets.push({// set dependency
        set: draw.set().add(jointPoints.points[jointPoints.points.length - 1].circle, secondCircle),
        setXvalue: x2,
        setYvalue: y2
      });
      dependency.push(jointPoints.points.length - 1,secondCircleIndex);
      
      jointPoints.addPoint(jointX, jointY);//the invisible round way line 2
      jointPoints.links[jointPoints.links.length-1].line.hide();
      jointPoints.sets.push({// set dependency
        set: draw.set().add(jointPoints.points[jointPoints.points.length - 1].circle, jointPoints.points[jointPoints.points.length - 3].circle),
        setXvalue: jointX,
        setYvalue: jointY
      });
      dependency.push(jointPoints.points.length - 1,jointPoints.points.length - 3);
      
    } else {
      jointX = svgPoint(event)[0];
      jointY = svgPoint(event)[1];
      jointPoints.addPoint(jointX, jointY);
      setDependency = false;
    }

    handlers.updateCircleIdArray();

    if (setDependency === true) {
      var targetCircleIndex = circleIdArray.indexOf(event.target.getAttribute('id'));
      jointPoints.sets.push({
        set: draw.set().add(jointPoints.points[jointPoints.points.length - 1].circle, jointPoints.points[targetCircleIndex].circle),
        setXvalue: event.target.getAttribute('cx'),
        setYvalue: event.target.getAttribute('cy')
      });
      dependency.push(jointPoints.points.length - 1,targetCircleIndex);
    }
    hitButton++;
  },
  updateCircleIdArray: function(){
    circleIdArray = []; //reset the Array which will have all the Ids for the circles on the screen
    for (i = 0; i < jointPoints.points.length; i++) {
      circleIdArray.push(jointPoints.points[i].circle.id());
    }
  },
  mouseFollowingLine: function(event) { //replot the moving line to wherever the mouse moves
    if (hitButton === 0) {
      movingLine.plot(0, 0, 1, 1);
    } else {
      if (event.target.tagName === 'circle') {
        jointX = event.target.getAttribute('cx');
        jointY = event.target.getAttribute('cy');
      } else {
        jointX = svgPoint(event)[0];
        jointY = svgPoint(event)[1];
      }
      var lastPoint = jointPoints.points[jointPoints.points.length - 1];
      movingLine.plot(lastPoint.xValue, lastPoint.yValue, jointX, jointY).back();
    }
  },
  drawingStart: function() { //when the drawingStartButton is clicked, this function runs
    drawingStartButton.value = 1 - drawingStartButton.value; //changes the value for the button between 0 and 1 when clicked
    if (drawingStartButton.value === '1' && scaleValue !== '' && scaleValue != 0) {
      drawingStartButton.innerHTML = 'Multi-Line<br>(ESC to stop drawing)';
      drawInDom.addEventListener('click', this.drawPolyline);
      window.addEventListener('mousemove', handlers.mouseFollowingLine);
    }
  },
  checkEscPressed: function(e) { //when drawing stops, activate the dragging point function
    if (e.keyCode == "27") {
      hitButton = 0; //if Esc is pressed, set the hitButton value to 0
      movingLine.plot(0, 0, 1, 1);
      drawingStartButton.value = 0;
      drawingStartButton.innerHTML = 'Draw the Truss(Multi-line)<br>(Click to start)';
      drawInDom.removeEventListener('click', handlers.drawPolyline);
      window.removeEventListener('mousemove', handlers.mouseFollowingLine);
      /* circleIdArray =[];//reset the Array which will have all the Ids for the circles on the screen
      for (i = 0;i<jointPoints.points.length;i++){
        circleIdArray.push(jointPoints.points[i].circle.id());
      } */
      lineIdArray = [];
      for (i = 0; i < jointPoints.links.length; i++) {
        lineIdArray.push(jointPoints.links[i].line.id());
      }
    }
  },
  highlightPoint: function(event) {
    var coordinatesDisplay = document.getElementById('coordinatesDisplay'); //To show the coordinates of a point when mouseover it
    for (i = 0; i < jointPoints.points.length; i++) {
      jointPoints.points[i].circle.stroke({opacity: 0});
    }
    origin.stroke({opacity: 0});
    coordinatesDisplay.innerHTML = '';
    if (scaleValue ===""){
      coordinatesDisplay.innerHTML = "Please set the scale below before starting";
    } else {
      if (event.target.tagName === 'circle') {
        var pointTrussX = (event.target.getAttribute('cx') - originXvalue).toFixed(3);
        var pointTrussY = (originYvalue - event.target.getAttribute('cy')).toFixed(3);
        unitX = (pointTrussX/scaleRatio).toFixed(3);
        unitY = (pointTrussY/scaleRatio).toFixed(3);
        coordinatesDisplay.innerHTML = 'Coordinates:' + unitX + ", " + unitY + " (unit:"+ scaleUnit +")";
        event.target.setAttribute("stroke-opacity", "1");
      } else {
        var svgXcoord = svgPoint(event)[0];
        var svgYcoord = svgPoint(event)[1];
        var trussXcoord = (svgXcoord - originXvalue).toFixed(3);
        var trussYcoord = (originYvalue - svgYcoord).toFixed(3);
        unitX = (trussXcoord/scaleRatio).toFixed(3);
        unitY = (trussYcoord/scaleRatio).toFixed(3);
        coordinatesDisplay.innerHTML = 'Coordinates:' + unitX + ", " + unitY + " (unit:"+ scaleUnit +")";
      }
    }
    
  },
  highlightLine: function(event){
    highlightLine.plot('0,0 1,1');
    if(event.target.tagName === "line" && event.target.id!=="movingLine" && event.target.instance.hasClass("notMember")===false){
      var x1 = event.target.getAttribute("x1");
      var y1 = event.target.getAttribute("y1");
      var x2 = event.target.getAttribute("x2");
      var y2 = event.target.getAttribute("y2");
      highlightLine.plot([[Number(x1), Number(y1)], [Number(x2), Number(y2)]]).back();
    }
  },
  
  //update X and Y coords from user input
  updateValue: function() {
    var circleSelectedIndex = circleIdArray.indexOf(circleSelected.circle.id());
    var newTrussX = document.getElementById('xCoordInput').valueAsNumber*scaleRatio;
    var newTrussY = document.getElementById('yCoordInput').valueAsNumber*scaleRatio;
    var newXvalue = newTrussX + originXvalue;
    var newYvalue = originYvalue - newTrussY;
    jointPoints.changePoint(circleSelectedIndex, newXvalue, newYvalue);
    document.getElementById("xCoordInput").value = '';
    document.getElementById("yCoordInput").value = '';
    jointPoints.points.forEach(function(each) {
      each.circle.node.setAttribute('fill', '#808080');
    });
    jointPoints.links.forEach(function(each) {
      each.line.node.setAttribute('stroke-width', '3');
    });
  },

  //A function for selecting(thicking lines and changing dots' color)
  //This won't fire if mouse was dragging instead of clicking(see:mousedown,mousemove,mouseup)
  selectNodeAndLine: function(event) {
    if (drawingStartButton.value === "0") {
      if (event.target.tagName === 'circle' && event.target.id !== originId) {
        if (event.target.getAttribute('fill') !== 'red') {
          event.target.setAttribute('fill', 'red');
        } else {
          event.target.setAttribute('fill', '#808080');
        }
      } else if (event.target.tagName === 'line') {
        if (event.target.getAttribute('stroke-width') === '3') {
          event.target.setAttribute('stroke-width', '6');
        } else {
          event.target.setAttribute('stroke-width', '3');
        }
      } else {
        jointPoints.points.forEach(function(each) {
          each.circle.node.setAttribute('fill', '#808080');
        });
        jointPoints.links.forEach(function(each) {
          each.line.node.setAttribute('stroke-width', '3');
        });
      }
    }
    //Display the coords of selected circle; change the content of the rightside boxes
    circleSelectedCount = 0;
    jointPoints.points.forEach(function(each) {
      if (each.circle.node.getAttribute('fill') === 'red') {
        circleSelectedCount++;
        circleSelected = each;
      }
    });
    if (circleSelectedCount === 1) {
      document.getElementById("xCoordInput").value = (circleSelected.trussX/scaleRatio).toFixed(3);
      document.getElementById("yCoordInput").value = (circleSelected.trussY/scaleRatio).toFixed(3);
      document.getElementById("arrowheadNotice").innerHTML = "Now choose the direction of load:";
      document.getElementById("supportNotice").innerHTML = "Choose the support type or no support(X):";
    } else if (circleSelectedCount > 1) {
      document.getElementById("arrowheadNotice").innerHTML = "You selected more than one joint";
      document.getElementById("supportNotice").innerHTML = "You selected more than one joint";
      document.getElementById("xCoordInput").value = '';
      document.getElementById("yCoordInput").value = '';
    } else {
      document.getElementById("arrowheadNotice").innerHTML = "Select a joint to add load<br>Or click on a load to change it";
      document.getElementById("supportNotice").innerHTML = "Select a joint to add support<br>Or click on a support to change it";
      document.getElementById("xCoordInput").value = '';
      document.getElementById("yCoordInput").value = '';
    }

    //Display the button for people to delete the selected line/lines
    var lineSelectedCount = 0;
    jointPoints.links.forEach(function(entry) {
      if (entry.line.node.getAttribute('stroke-width') === '6') {
        lineSelectedCount++;
      }
    });
    
  },

  //An eventListener to delete selected lines and associated dots
  deleteElement: function(event) {
    if (event.keyCode === 46 || event.keyCode === 68 ||event.keyCode === 27) {
      //delete selected lines
      jointPoints.links.forEach(function(entry) {
        if (entry.line.node.getAttribute('stroke-width') === '6') {
          entry.line.hide();
        }
      });
      //then delete lonely dots
      if (typeof jointPoints.links[0] ==="undefined"){
        if (typeof jointPoints.points[0] !=="undefined"){
          jointPoints.points[0].circle.hide();}
      } else if (jointPoints.links[0].line.visible() === false) { //if the first line is hidden, hide the first dot
        jointPoints.points[0].circle.hide();
      }
      if (jointPoints.links[jointPoints.links.length - 1].line.visible() === false) { //if the last line is hidden, hide the last dot
        jointPoints.points[jointPoints.points.length - 1].circle.hide();
      }
      for (var i = 0; i < jointPoints.links.length - 1; i++) { //if two consecutive lines are hidden, hide the middle dot
        if (jointPoints.links[i].line.visible() === false && jointPoints.links[i + 1].line.visible() === false) {
          jointPoints.points[i + 1].circle.hide();
        }
      }
    }
  }
};
window.addEventListener("keydown", handlers.checkEscPressed, false);
drawInDom.addEventListener('mousemove', handlers.highlightPoint, true); //to highlight a point when a mouse is over
drawInDom.addEventListener('mousemove', handlers.highlightLine, true);
window.addEventListener('keydown', handlers.deleteElement, false);


//
var mouseMoveOrNot = false;
var mousedownTargetIndex;
var mousedownTargetId;
drawInDom.addEventListener("mousedown", function() {
  mouseMoveOrNot = false;
  if (event.target.tagName === 'circle' && drawingStartButton.value === '0') { //for the mousedown circle to be at the bottom
    var circlePositionArray = [];
    for (i = 0; i < jointPoints.points.length; i++) {
      circlePositionArray.push(jointPoints.points[i].circle.position());
    }
    var circleIndex = circleIdArray.indexOf(event.target.getAttribute('id'));
    var minPositionCircleIndex = circlePositionArray.indexOf(Math.min.apply(null, circlePositionArray));
    var theCircle = jointPoints.points[circleIndex];
    var circleGroupIndex = [];
    for (i = 0; i < jointPoints.points.length; i++) {
      if (jointPoints.points[i].xValue === theCircle.xValue && jointPoints.points[i].yValue === theCircle.yValue) {
        circleGroupIndex.push(i);
      }
    }
    if (circleIndex !== minPositionCircleIndex) {
      circleGroupIndex.forEach(function(entry) {
        if (entry !== minPositionCircleIndex) {
          jointPoints.points[minPositionCircleIndex].circle.before(jointPoints.points[entry].circle);
        }
      });
    }
    //for putting the clicked circle at the top of the circle cluster
    circleGroupIndex.forEach(function(entry) {
      if (entry !== circleIndex) {
        jointPoints.points[circleIndex].circle.before(jointPoints.points[entry].circle);
      }
    });

    mousedownTargetId = event.target.getAttribute('id');
    mousedownTargetIndex = circleIdArray.indexOf(event.target.getAttribute('id'));
  }
}, true);
drawInDom.addEventListener("mousemove", function() {
  mouseMoveOrNot = true;
}, false);
drawInDom.addEventListener("mouseup", function(event) {
  if (mouseMoveOrNot === false) {
    handlers.selectNodeAndLine(event);
  }
  if (event.target.tagName === 'circle' && drawingStartButton.value === '0' && event.target.id !== originId) {
    var mouseupTargetIndex = circleIdArray.indexOf(event.target.getAttribute('id'));
    if (mouseupTargetIndex !== mousedownTargetIndex) {
      var mouseupTarget = jointPoints.points[mouseupTargetIndex];
      jointPoints.sets.push({
        set: draw.set().add(jointPoints.points[mousedownTargetIndex].circle, jointPoints.points[mouseupTargetIndex].circle),
        setXvalue: jointPoints.points[mousedownTargetIndex].xValue,
        setYvalue: jointPoints.points[mousedownTargetIndex].yValue
      });
    }
  }
}, false);

var arrowheads = document.getElementsByClassName('arrowhead');
var polyOverArrow = draw.polygon('0,0 0,1 1,1 1,0').fill('none').stroke({
  width: 1
});
var circleOfLoad;
var directionOfLoad;
var test;

var loadHandlers = {

  //change the color of the arrowhead button when clicked
  arrowheadChangeColor: function(element) {
    if (circleSelectedCount == 1) {
      for (i = 0; i < 4; i++) {
        arrowheads[i].style.backgroundColor = "yellow";
      }
      element.style.backgroundColor = "#900C3F";
    }
  },

  addLoad: function() {
    var loadDirection;
    for (i = 0; i < 4; i++) {
      if (arrowheads[i].style.backgroundColor !== "yellow") {
        loadDirection = i;
      }
    }
    var loadMagnitude = Number(document.getElementById('loadValueInput').value);
    var loadUnit = document.getElementById("loadUnitSelect").value;
    var circleSelectedIndex = circleIdArray.indexOf(circleSelected.circle.id());
    jointPoints.addLoad(circleSelectedIndex, loadDirection, loadMagnitude);
    document.getElementById('loadValueInput').value = '';
    for (i = 0; i < 4; i++) {
      arrowheads[i].style.backgroundColor = "yellow"; //unselect the arrows
    }
    jointPoints.points.forEach(function(each) {
      each.circle.node.setAttribute('fill', '#808080'); //unselect the circles;
    });
  },

  selectLoad: function(event) {
    //test = event.target;
    //console.log(event.target.className)
    if (event.target.getAttribute("class") === "load") {
      //console.log(event.target.instance);
      //event.target.instance.remove();
      //console.log(jointPoints.points[0].loadToRight);
      var loadIndex = allLoadIdArray.indexOf(event.target.id);
      circleOfLoad = Math.floor(loadIndex / 4);
      directionOfLoad = loadIndex % 4;
      var loadDirectionNames = ["loadToRight", "loadToLeft", "loadToTop", "loadToBottom"];
      var loadValue = jointPoints.points[circleOfLoad].load[directionOfLoad];
      //console.log(loadIndex,circleOfLoad,directionOfLoad);
      var arrowX = Number(event.target.getAttribute("x"));
      var arrowY = Number(event.target.getAttribute("y"));
      var arrowHeight = Number(event.target.getAttribute("height"));

      for (i = 0; i < 4; i++) {
        arrowheads[i].style.backgroundColor = "yellow";
      }
      polyOverArrow.plot([
        [arrowX, arrowY],
        [(arrowX + arrowHeight), arrowY],
        [(arrowX + arrowHeight), (arrowY + arrowHeight)],
        [arrowX, (arrowY + arrowHeight)]
      ]);
      document.getElementById("arrowheadNotice").innerHTML = "change the magnitude<br>or delete load";
      arrowheads[directionOfLoad].style.backgroundColor = "#900C3F";
      document.getElementById("loadValueInput").value = loadValue;
      document.getElementById("addLoadButton").style.display = "none";
      document.getElementById("changeLoadButton").style.display = "inline-block";
      document.getElementById("deleteLoadButton").style.display = "inline-block";
    } else {
      polyOverArrow.plot([
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0]
      ]);
      for (i = 0; i < 4; i++) {
        arrowheads[i].style.backgroundColor = "yellow";
      }
      document.getElementById("loadValueInput").value = '';
      document.getElementById("addLoadButton").style.display = "inline-block";
      document.getElementById("changeLoadButton").style.display = "none";
      document.getElementById("deleteLoadButton").style.display = "none";
    }
  },
  changeLoad: function() {
    var newLoadValue = Number(document.getElementById("loadValueInput").value);
    jointPoints.changeLoad(circleOfLoad, directionOfLoad, newLoadValue);
    //put things back to normal
    polyOverArrow.plot([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0]
    ]);
    document.getElementById("arrowheadNotice").innerHTML = "Select a joint to add load<br>Or click on a load to change it";
    for (i = 0; i < 4; i++) {
      arrowheads[i].style.backgroundColor = "yellow";
    }
    document.getElementById("loadValueInput").value = '';
    document.getElementById("addLoadButton").style.display = "inline-block";
    document.getElementById("changeLoadButton").style.display = "none";
    document.getElementById("deleteLoadButton").style.display = "none";
  },
  deleteLoad: function() {
    jointPoints.deleteLoad(circleOfLoad, directionOfLoad);
    //put things back to normal
    polyOverArrow.plot([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0]
    ]);
    document.getElementById("arrowheadNotice").innerHTML = "Select a joint to add load<br>Or click on a load to change it";
    for (i = 0; i < 4; i++) {
      arrowheads[i].style.backgroundColor = "yellow";
    }
    document.getElementById("loadValueInput").value = '';
    document.getElementById("addLoadButton").style.display = "inline-block";
    document.getElementById("changeLoadButton").style.display = "none";
    document.getElementById("deleteLoadButton").style.display = "none";
  }
};
drawInDom.addEventListener('click', loadHandlers.selectLoad, true);

var supportImages = document.getElementsByClassName('supportImage');
var supportTypeString;
var polyOverSupport = draw.polygon('0,0 0,1 1,1 1,0').fill('none').stroke({width: 1});

var supportHandlers = {
  changeColor: function(element) {
    if (circleSelectedCount == 1) {
      for (i = 0; i < 5; i++) {
        supportImages[i].style.backgroundColor = "#20D5EE";
      }
      element.style.backgroundColor = "#4180E8";
      supportTypeString = String(element.getAttribute("id"));

    }
  },
  selectSupport: function() {
    if (event.target.tagName == "image") {
      if (event.target.getAttribute("class").includes("support")) {
        var supportX = Number(event.target.getAttribute("x"));
        var supportY = Number(event.target.getAttribute("y"));
        var supportHeight = Number(event.target.getAttribute("height"));
        polyOverSupport.plot([
          [supportX, supportY],
          [(supportX + supportHeight), supportY],
          [(supportX + supportHeight), (supportY + supportHeight)],
          [supportX, (supportY + supportHeight)]
        ]);
        for (i = 0; i < 5; i++) {
          supportImages[i].style.backgroundColor = "#20D5EE";
        }
        document.getElementById("supportNotice").innerHTML = "Change or Delete Support";
        var typeOfSupport;
        if (event.target.getAttribute("class").includes("pinned")) {
          typeOfSupport = 0;
        } else if (event.target.getAttribute("class").includes("rollerBottom")) {
          typeOfSupport = 1;
        } else if (event.target.getAttribute("class").includes("rollerTop")) {
          typeOfSupport = 2;
        } else if (event.target.getAttribute("class").includes("rollerRight")) {
          typeOfSupport = 3;
        } else if (event.target.getAttribute("class").includes("rollerLeft")) {
          typeOfSupport = 4;
        }
        supportImages[typeOfSupport].style.backgroundColor = "#4180E8";
        var associatedCircleIndex = allSupportIdArray.indexOf(event.target.id);
        jointPoints.points.forEach(function(each) {
          each.circle.node.setAttribute('fill', '#808080'); //unselect the circles;
        });
        jointPoints.points[associatedCircleIndex].circle.node.setAttribute('fill', 'red');
        circleSelectedCount = 1;
        document.getElementById("deleteSupportButton").style.display = "inline-block";
      }
    } else {
      polyOverSupport.plot([
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0]
      ]);
      for (i = 0; i < 5; i++) {
        supportImages[i].style.backgroundColor = "#20D5EE";
      }
      document.getElementById("deleteSupportButton").style.display = "none";
      circleSelectedCount = 0;
    }
  },

  updateSupport: function() {
    for (i = 0; i < 5; i++) {
      supportImages[i].style.backgroundColor = "#20D5EE";
    }
    var circleSelectedIndex = circleIdArray.indexOf(circleSelected.circle.id());
    if (supportTypeString == "none") {
      jointPoints.deleteSupport(circleSelectedIndex);
    } else {
      var support = jointPoints.points[circleSelectedIndex].support;
      if (typeof support != "undefined") {
        jointPoints.changeSupport(circleSelectedIndex, supportTypeString);
      } else {
        jointPoints.addSupport(circleSelectedIndex, supportTypeString);
      }
    }
    jointPoints.points.forEach(function(each) {
      each.circle.node.setAttribute('fill', '#808080'); //unselect the circles;
    });
    polyOverSupport.plot([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0]
    ]);
  },
  deleteSupport: function() {
    for (i = 0; i < 5; i++) {
      supportImages[i].style.backgroundColor = "#20D5EE";
    }
    var circleSelectedIndex = circleIdArray.indexOf(circleSelected.circle.id());
    jointPoints.deleteSupport(circleSelectedIndex);
    polyOverSupport.plot([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0]
    ]); //unselect the support
    jointPoints.points.forEach(function(each) {
      each.circle.node.setAttribute('fill', '#808080'); //unselect the circles;
    });

  }
};
drawInDom.addEventListener('click', supportHandlers.selectSupport, false);

var areaColor={};
var availableColor = ['red','green','blue','brown','purple','yellow','orange','#556B2F','#FF1493','#ADFF2F','#FFA07A','#000080'];
var aeHandlers={
  addArea: function(){
    var sectionArea = Number(document.getElementById('areaInput').value);
    var sectionAreaUnit = document.getElementById("areaUnitSelect").value;
    if(sectionArea in areaColor){
      color = areaColor[sectionArea];
    } else {
      color = availableColor[0];
      areaColor[sectionArea] = availableColor[0];
      availableColor = availableColor.slice(1,availableColor.length).concat(availableColor[0]);
    }
    lineSelected.forEach(function(each){
      each.area = sectionArea;
      each.line.attr({stroke:color});
    });
    document.getElementById('areaInput').value = "";
    jointPoints.links.forEach(function(each) {//unselect all lines
      each.line.node.setAttribute('stroke-width', '3');
    });
  },
  addAreaAll: function(){
    var sectionArea = Number(document.getElementById('areaInput').value);
    var sectionAreaUnit = document.getElementById("areaUnitSelect").value;
    if(sectionArea in areaColor){
      color = areaColor[sectionArea];
    } else {
      color = availableColor[0];
      areaColor[sectionArea] = availableColor[0];
      availableColor = availableColor.slice(1,availableColor.length).concat(availableColor[0]);
    }
    jointPoints.links.forEach(function(each){
      each.area = sectionArea;
      each.line.attr({stroke:color});
    });
    document.getElementById('areaInput').value = "";
    jointPoints.links.forEach(function(each) {//unselect all lines
      each.line.node.setAttribute('stroke-width', '3');
    });
  },
  addE: function(){
    var sectionE = Number(document.getElementById("eInput").value);
    var sectionEUnit = document.getElementById("eUnitSelect").value;
    lineSelected.forEach(function(each){
      each.e = sectionE;
    });
    document.getElementById("eInput").value = "";
    jointPoints.links.forEach(function(each) {//unselect all lines
      each.line.node.setAttribute('stroke-width', '3');
    });

  },
  addEAll: function(){
    var sectionE = Number(document.getElementById("eInput").value);
    var sectionEUnit = document.getElementById("eUnitSelect").value;
    jointPoints.links.forEach(function(each){
      each.e = sectionE;
    });
    document.getElementById("eInput").value = "";
    jointPoints.links.forEach(function(each) {//unselect all lines
      each.line.node.setAttribute('stroke-width', '3');
    });
  }
};

function compareArray(array1, array2) {
  if (!array1 || !array2) {
    return false;
  } else if (array1.length !== array2.length) {
    return false;
  } else if (array1.length === array2.length === 0) {
    return true;
  } else {
    if (array1[0] == array2[0]) {
      if (array1.length == 1) {
        return true;
      } else {
        return compareArray(array1.slice(1, array1.length), array2.slice(1, array2.length));
      }
    } else {
      return false;
    }
  }
}

function addArray(array1, array2) {
  if (array1.length === 0 && array2.length === 0) {
    return [];
  } else {
    return [array1[0] + array2[0]].concat(addArray(array1.slice(1, array1.length), array2.slice(1, array2.length)));
  }
}

var Ks;
var KsMod;
var numberOfNodes;
var displacement;
var jointForce;
var engine = {
  nodesArray: [],
  nodes: {},
  newNodes: {},
  nodeNumberDisplay: [],
  elements: [],
  elementNumberDisplay:[],
  support: {},
  load: {},
  loadVector:[],
  barForceArray:[],
  barStressArray:[],
  displayBars:[],
  displayNumbers:[],
  displacementLines:[],
  reactionArrows:[],

  getNodes: function() {
    this.nodesArray = [];
    this.nodes = {};
    jointPoints.points.forEach(function(point) {
      if (point.circle.visible() === true) {
        var nodesKeys = Object.keys(this.nodes);
        numberOfNodes = nodesKeys.length;
        var repeatCount = 0;
        nodesKeys.forEach(function(key){
          if(compareArray(this.nodes[key],[point.trussX, point.trussY])===true){
            repeatCount++;
          }
        },engine);
        if (repeatCount ===0){
          this.nodes[numberOfNodes+1] = [point.trussX, point.trussY];
        }
      }
    }, engine);
    var nodesKeys = Object.keys(this.nodes);
    numberOfNodes = nodesKeys.length;
  },
  defineK: function(){
    Ks = math.zeros(math.matrix([Object.keys(this.nodes).length*2,Object.keys(this.nodes).length*2]));//define Ks
  },
  getElements: function() {
    this.getNodes();
    this.elements = [];
    jointPoints.links.forEach(function(link) {
      if (link.line.visible() === true) {
        var startCoords = link.startTrussCoords;
        var endCoords = link.endTrussCoords;
        var startNode = 0;
        var endNode = 0;
        for (i = 1; i < (Object.keys(this.nodes).length*2 / 2 + 1); i++) {
          if (compareArray(this.nodes[i], startCoords) === true) {
            startNode = i;
          } else if (compareArray(this.nodes[i], endCoords) === true) {
            endNode = i;
          }
        }
        if (startNode !== 0 && endNode !== 0) {
          if (this.nodes[startNode][0] > this.nodes[endNode][0]) {//make sure start node is not to the right of the end node
            endNode = [startNode, startNode = endNode][0];
          }
          var NodePair = [startNode, endNode];
          var differentArray = function differentArray(array) {
            if (compareArray(array, NodePair) === true) {
              return false;
            } else {
              return true;
            }
          };
          if (this.elements.every(differentArray)) {
            var newElement = NodePair.concat([link.area,link.e]);
            this.elements.push(newElement);
          }
        }
      }
    }, engine);
  },
  getLoad: function() {
    this.load = {};
    this.getNodes();
    jointPoints.points.forEach(function(point) {
      if (point.load.every(isZero) === false) {
        for (i = 1; i < (Object.keys(this.nodes).length*2 / 2 + 1); i++) {
          if (compareArray(this.nodes[i], [point.trussX, point.trussY]) === true) {
            if (typeof this.load[i] == "undefined") {
              this.load[i] = point.load;
            } else {
              this.load[i] = addArray(this.load[i], point.load);
            }
          }
        }
      }
    }, engine);
  },
  finalLoad: function(){//make the four direction loads into two (x and y direction) loads
    this.getLoad();
    this.loadVector = math.zeros(Object.keys(this.nodes).length*2);
    var loadKeys = Object.keys(this.load);
    loadKeys.forEach(function(key){
      var theLoad = this.load[key];
      this.loadVector.subset(math.index(key*2-2),(theLoad[0]-theLoad[1]));
      this.loadVector.subset(math.index(key*2-1),(theLoad[2]-theLoad[3]));
    },engine);
  },
  getSupport: function() {
    this.support = {}; //new edit
    this.getNodes();
    jointPoints.points.forEach(function(point) {
      if (typeof point.support !== "undefined") {
        for (i = 1; i < (Object.keys(this.nodes).length*2 / 2 + 1); i++) {
          if (compareArray(this.nodes[i], [point.trussX, point.trussY]) === true) {
            if (point.support == "rollerLeft" || point.support == "rollerRight") {
              this.support[i] = [1, 0];
            } else if (point.support == "rollerTop" || point.support == "rollerBottom") {
              this.support[i] = [0, 1];
            } else {
              this.support[i] = [1, 1];
            }
          }
        }
      }
    }, engine);
  },
  stiffnessMatrix: function(member){
    var i = member[0];
    var j = member[1];
    var firstNodeCoords = this.nodes[member[0]];
    var lastNodeCoords = this.nodes[member[1]];
    var memberLength = Math.sqrt(Math.pow(firstNodeCoords[0]-lastNodeCoords[0],2)+Math.pow(firstNodeCoords[1]-lastNodeCoords[1],2));
    var cos = (lastNodeCoords[0]-firstNodeCoords[0])/(memberLength);
    var sin = (lastNodeCoords[1]-firstNodeCoords[1])/(memberLength);
    var cosSq = Math.pow(cos,2);
    var sinSq = Math.pow(sin,2);
    var fourByFourK = math.matrix([[cosSq,cos*sin,-cosSq,-cos*sin],[cos*sin,sinSq,-cos*sin,-sinSq],[-cosSq,-sin*cos,cosSq,cos*sin],[-cos*sin,-sinSq,cos*sin,sinSq]]);
    var memberK = math.multiply(member[2]*member[3]/(memberLength/scaleRatio),fourByFourK);
    //console.log(memberK.valueOf());
    Ks.subset(math.index((2*i-2),[(2*i-2),(2*i-1)]),math.add(Ks.subset(math.index((2*i-2),[(2*i-2),(2*i-1)])),memberK.subset(math.index(0,[0,1]))));//Kii
    Ks.subset(math.index((2*i-1),[(2*i-2),(2*i-1)]),math.add(Ks.subset(math.index((2*i-1),[(2*i-2),(2*i-1)])),memberK.subset(math.index(1,[0,1]))));//Kii
    //Ks.subset(math.index((2*i-1),[(2*i-2),(2*i-1)]),memberK.subset(math.index(1,[0,1])));
    Ks.subset(math.index((2*i-2),[(2*j-2),(2*j-1)]),math.add(Ks.subset(math.index((2*i-2),[(2*j-2),(2*j-1)])),memberK.subset(math.index(0,[2,3]))));//Kij
    //Ks.subset(math.index((2*i-2),[(2*j-2),(2*j-1)]),memberK.subset(math.index(0,[2,3])));//Kij
    Ks.subset(math.index((2*i-1),[(2*j-2),(2*j-1)]),math.add(Ks.subset(math.index((2*i-1),[(2*j-2),(2*j-1)])),memberK.subset(math.index(1,[2,3]))));//Kij
    //Ks.subset(math.index((2*i-1),[(2*j-2),(2*j-1)]),memberK.subset(math.index(1,[2,3])));
    Ks.subset(math.index((2*j-2),[(2*i-2),(2*i-1)]),math.add(Ks.subset(math.index((2*j-2),[(2*i-2),(2*i-1)])),memberK.subset(math.index(2,[0,1]))));//Kji
    //Ks.subset(math.index((2*j-2),[(2*i-2),(2*i-1)]),memberK.subset(math.index(2,[0,1])));//Kji
    Ks.subset(math.index((2*j-1),[(2*i-2),(2*i-1)]),math.add(Ks.subset(math.index((2*j-1),[(2*i-2),(2*i-1)])),memberK.subset(math.index(3,[0,1]))));//Kji
    //Ks.subset(math.index((2*j-1),[(2*i-2),(2*i-1)]),memberK.subset(math.index(3,[0,1])));
    Ks.subset(math.index((2*j-2),[(2*j-2),(2*j-1)]),math.add(Ks.subset(math.index((2*j-2),[(2*j-2),(2*j-1)])),memberK.subset(math.index(2,[2,3]))));//Kjj
    //Ks.subset(math.index((2*j-2),[(2*j-2),(2*j-1)]),memberK.subset(math.index(2,[2,3])));//Kjj
    Ks.subset(math.index((2*j-1),[(2*j-2),(2*j-1)]),math.add(Ks.subset(math.index((2*j-1),[(2*j-2),(2*j-1)])),memberK.subset(math.index(3,[2,3]))));//Kjj
    //Ks.subset(math.index((2*j-1),[(2*j-2),(2*j-1)]),memberK.subset(math.index(3,[2,3])));
  },
  completeMatrix:function(){
    this.getNodes();
    this.getElements();
    this.defineK();
    KsMod = math.clone(Ks);
    this.elements.forEach(function(member){
      this.stiffnessMatrix(member);
    },engine);
    //console.log(Ks.valueOf());
  },
  modifiedMatrix:function(){
    this.getSupport();
    this.finalLoad();
    this.completeMatrix();
    KsMod = math.clone(Ks);
    var supportNodes = Object.keys(this.support);
    supportNodes.forEach(function(node){//make the zero-displacement rows and columns all zeros
      if(this.support[node][0]!==0){
        //KsMod.subset(math.index(node*2-2),math.zeros(Object.keys(this.nodes).length*2));
        for(i=0;i<Object.keys(this.nodes).length*2;i++){
          KsMod.subset(math.index(i,node*2-2),0);
          KsMod.subset(math.index(node*2-2,i),0);
        }
      }
      if(this.support[node][1]!==0){
        //KsMod.subset(math.index(node*2-1),math.zeros(Object.keys(this.nodes).length*2));
        for(i=0;i<Object.keys(this.nodes).length*2;i++){
          KsMod.subset(math.index(i,node*2-1),0);
          KsMod.subset(math.index(node*2-1,i),0);
        }
      }
    },engine);
    for(i=0;i<Object.keys(this.nodes).length*2;i++){//make sure the diagonal values are non-zero
       if(KsMod.subset(math.index(i,i))===0){//if they are zero, make them 1
         KsMod.subset(math.index(i,i),1);
       }
    }
  },
  transform: function(member){
    var firstNodeCoords = this.nodes[member[0]];
    var lastNodeCoords = this.nodes[member[1]];
    var memberLength = Math.sqrt(Math.pow(firstNodeCoords[0]-lastNodeCoords[0],2)+Math.pow(firstNodeCoords[1]-lastNodeCoords[1],2));
    var cos = (lastNodeCoords[0]-firstNodeCoords[0])/(memberLength);
    var sin = (lastNodeCoords[1]-firstNodeCoords[1])/(memberLength);
    var transMatrix = math.matrix([[cos,sin,0,0], [-sin,cos,0,0],[0,0,cos,sin],[0,0,-sin,cos]]);
    var memberDisp = [displacement[member[0]*2-2],displacement[member[0]*2-1],displacement[member[1]*2-2],displacement[member[1]*2-1]];
    var localDisp = math.multiply(transMatrix,memberDisp).valueOf();
    var axialDisp = localDisp[2]-localDisp[0];
    var barForce = ((member[2]*member[3]/(memberLength/scaleRatio))*axialDisp).toPrecision(7);
    if(math.abs(barForce)<1e-7){
      barForce = 0;
    }
    this.barForceArray.push(barForce);
    this.barStressArray.push((barForce/member[2]).toPrecision(7));
  },
  compute: function(){
    this.modifiedMatrix();
    displacement = math.multiply(math.inv(KsMod),engine.loadVector).valueOf();
    jointForce = math.multiply(Ks,displacement).valueOf();
    jointForce.forEach(function(element,index,array){//make sure the calculation reminants (item<1e-7) are just made to be zero
      if(math.abs(element) < 1e-7) {
        array[index] = 0;
      }
    });
    this.barForceArray = [];
    this.barStressArray = [];
    this.elements.forEach(function(member){
      this.transform(member);
    },engine);
  },
  
  forceDisplay: function(){
    this.stopDisplaying();
    this.compute();
    //nodes and elements will be shown, their functions are at the end of this program since they should show on top
    var barForce;
    var barColor;
    var tOrC;
    var nonZeroAbsForces = [];
    this.barForceArray.forEach(function(force){
      if(force !== 0){
        nonZeroAbsForces.push(math.abs(force));
      }
    });
    var minForce = Math.min.apply(null, nonZeroAbsForces);
    var maxForce = Math.max.apply(null, nonZeroAbsForces);
    var graphSlope = 25/(maxForce-minForce);
    this.elements.forEach(function(member,index){// create the display bars and the number on them
      var firstNodeCoords = math.clone(this.nodes[member[0]]);
      var lastNodeCoords = math.clone(this.nodes[member[1]]);
      var memberLength = Math.sqrt(Math.pow(firstNodeCoords[0]-lastNodeCoords[0],2)+Math.pow(firstNodeCoords[1]-lastNodeCoords[1],2));
      var cos = (lastNodeCoords[0]-firstNodeCoords[0])/(memberLength);
      var sin = (lastNodeCoords[1]-firstNodeCoords[1])/(memberLength);
      var angle = math.asin(sin)/Math.PI*180;
      
      if (this.barForceArray[index]>0){
        barForce = math.clone(this.barForceArray[index]);
        tOrC = "t";
      } else if (this.barForceArray[index]<0) {
        barForce = math.clone(math.abs(this.barForceArray[index]));
        tOrC = "c";
      } else {
        barForce = 0;
        tOrC = undefined;
      }
      //decide on the size of displayed bar
      barSize = (math.abs(barForce)-minForce)*graphSlope + 5;
      if (barForce === 0){
        barSize = 3;
      }
      //decide on the color of the bar based on tension or compression
      if (tOrC == "t"){
        barColor = "blue";
      } else if(tOrC == "c"){
        barColor = "#EA2DDF";
      } else {
        barColor = "black";
      }
      var oneThirdCoords = [firstNodeCoords[0]+(lastNodeCoords[0]-firstNodeCoords[0])/3,firstNodeCoords[1]+(lastNodeCoords[1]-firstNodeCoords[1])/3];
     
      var textCoords = [oneThirdCoords[0]-(barSize+15)*sin,oneThirdCoords[1]+(barSize+15)*cos];
      textCoords = [originXvalue + textCoords[0],originYvalue - textCoords[1]];
      if (barForce !== 0){
        this.displayNumbers.push({
          number: draw.text(Number(barForce).toFixed(1) + (tOrC == "t" ? " T" : " C")).move(textCoords[0],textCoords[1]).font({size:15, weight:'bold'}).fill(barColor).rotate(-angle,textCoords[0],textCoords[1])
        });
      }
      
      firstNodeCoords = [originXvalue + firstNodeCoords[0],originYvalue - firstNodeCoords[1]];//change truss coords to screen coords
      lastNodeCoords =  [originXvalue + lastNodeCoords[0],originYvalue - lastNodeCoords[1]];
      if (barForce === 0 ){
        this.displayBars.push({
          bar: draw.rect(memberLength,barSize).move(firstNodeCoords[0],firstNodeCoords[1]-barSize/2).rotate(-angle,firstNodeCoords[0],firstNodeCoords[1]).fill({color:barColor})
        });
      }else {
        this.displayBars.push({
          bar: draw.rect(memberLength,barSize).move(firstNodeCoords[0],firstNodeCoords[1]-barSize).rotate(-angle,firstNodeCoords[0],firstNodeCoords[1]).fill({color:barColor, opacity: 0.6}).stroke({ color: "black", width: 1 })
        });
      }
    },engine);
    this.displayNumbers.push({number: draw.text("Blue = Tension (T)").move(drawingBoardWidth-200,10).font({size:15, weight:'bold'}).fill("blue")});
    this.displayNumbers.push({number: draw.text("Pink = Compression (C)").move(drawingBoardWidth-200,28).font({size:15, weight:'bold'}).fill("#EA2DDF")});
    this.nodeDisplay();
    this.elementDisplay();
  },
  eraseForceDisplay: function(){
    if (this.displayBars.length !== 0){
      this.displayBars.forEach(function(each){
        each.bar.hide();
        each.bar.remove();
      });
      this.displayBars = [];
       this.displayNumbers.forEach(function(each){
        each.number.hide();
        each.number.remove();
      });
      this.displayNumbers = [];
    }
  },
  forceTable:function(){
    this.eraseForceTable();
     // get the reference for the body
    var body = document.getElementsByTagName("body")[0];
    // creates a <table> element and a <tbody> element
    var tbl     = document.createElement("table");
    var tblBody = document.createElement("tbody");
    tbl.setAttribute("id","forceTable");
    // creating all cells
    var head = tbl.createTHead();
    var firstRow = document.createElement("tr");
    var elementNumberCell = document.createElement("th");
    var nodeNumberCell = document.createElement("th");
    var forceCell = document.createElement("th");
    elementNumberCell.appendChild(document.createTextNode(" "));
    nodeNumberCell.appendChild(document.createTextNode("Nodes"));
    forceCell.appendChild(document.createTextNode("Bar Force"));
    firstRow.appendChild(elementNumberCell);
    firstRow.appendChild(nodeNumberCell);
    firstRow.appendChild(forceCell);
    head.appendChild(firstRow);
    for (var i = 0; i < this.elements.length; i++) {
      // creates a table row
      var row = document.createElement("tr");
      for (var j = 0; j < 3; j++) {
        // Create a <td> element and a text node, make the text
        // node the contents of the <td>, and put the <td> at
        // the end of the table row
        var cell = document.createElement("td");
        var cellText;
        var force;
        if(j===0){
          cellText = document.createTextNode(i+1);
        } else if (j===1){
          cellText = document.createTextNode(this.elements[i][0]+", "+this.elements[i][1]);
          cell.style.textAlign = "center";
        } else {
          var f = Number(this.barForceArray[i]);
          cellText = document.createTextNode(f === 0 ? "0" : Math.abs(f).toFixed(2) + (f > 0 ? " (T)" : " (C)"));
          row.style.backgroundColor = f > 0 ? "#D6E4FF" : (f < 0 ? "#FBD3F8" : "white");
        }
        cell.appendChild(cellText);
        row.appendChild(cell);
      }
   
      // add the row to the end of the table body
      tblBody.appendChild(row);
    }
   
    // put the <tbody> in the <table>
    tbl.appendChild(tblBody);
    // appends <table> into <body>
    body.appendChild(tbl);
    // sets the border attribute of tbl to 2;
    tbl.setAttribute("border", "2");
    tbl.style.zIndex = 3;
    tbl.style.position = 'absolute';
    tbl.style.left = "920px";
    tbl.style.top = "275px";
    tbl.style.width = "200px";
    tbl.style.backgroundColor = "white";
  },
  eraseForceTable:function(){
    if(document.getElementById("forceTable") !== null){
      document.getElementsByTagName("body")[0].removeChild(document.getElementById("forceTable"));
    } 
  },
  
  stressDisplay: function(){
    this.stopDisplaying();
    this.compute();
    //nodes and elements will be shown, their functions are at the end of this program since they should show on top
    var barStress;
    var barColor;
    var tOrC;
    var nonZeroAbsStresses = [];
    this.barStressArray.forEach(function(stress){
      if(stress !== 0){
        nonZeroAbsStresses.push(math.abs(stress));
      }
    });
    var minStress = Math.min.apply(null, nonZeroAbsStresses);
    var maxStress = Math.max.apply(null, nonZeroAbsStresses);
    var graphSlope = 25/(maxStress-minStress);
    this.elements.forEach(function(member,index){// create the display bars and the number on them
      var firstNodeCoords = math.clone(this.nodes[member[0]]);
      var lastNodeCoords = math.clone(this.nodes[member[1]]);
      var memberLength = Math.sqrt(Math.pow(firstNodeCoords[0]-lastNodeCoords[0],2)+Math.pow(firstNodeCoords[1]-lastNodeCoords[1],2));
      var cos = (lastNodeCoords[0]-firstNodeCoords[0])/(memberLength);
      var sin = (lastNodeCoords[1]-firstNodeCoords[1])/(memberLength);
      var angle = math.asin(sin)/Math.PI*180;
      
      if (this.barStressArray[index]>0){
        barStress = math.clone(this.barStressArray[index]);
        tOrC = "t";
      } else if (this.barStressArray[index]<0) {
        barStress = math.clone(math.abs(this.barStressArray[index]));
        tOrC = "c";
      } else {
        barStress = 0;
        tOrC = undefined;
      }
      //decide on the size of displayed bar
      barSize = (math.abs(barStress)-minStress)*graphSlope + 5;
      if (barStress === 0){
        barSize = 3;
      }
      //decide on the color of the bar based on tension or compression
      if (tOrC == "t"){
        barColor = "blue";
      } else if(tOrC == "c"){
        barColor = "#EA2DDF";
      } else {
        barColor = "black";
      }
      var oneThirdCoords = [firstNodeCoords[0]+(lastNodeCoords[0]-firstNodeCoords[0])/3,firstNodeCoords[1]+(lastNodeCoords[1]-firstNodeCoords[1])/3];
      var textCoords = [oneThirdCoords[0]-(barSize+15)*sin,oneThirdCoords[1]+(barSize+15)*cos];
      textCoords = [originXvalue + textCoords[0],originYvalue - textCoords[1]];
      if (barStress !== 0){
        this.displayNumbers.push({
          number: draw.text(Number(barStress).toFixed(1) + (tOrC == "t" ? " T" : " C")).move(textCoords[0],textCoords[1]).font({size:15, weight:'bold'}).fill(barColor).rotate(-angle,textCoords[0],textCoords[1])
        });
      }
      
      firstNodeCoords = [originXvalue + firstNodeCoords[0],originYvalue - firstNodeCoords[1]];//change truss coords to screen coords
      lastNodeCoords =  [originXvalue + lastNodeCoords[0],originYvalue - lastNodeCoords[1]];
      if (barStress === 0 ){
        this.displayBars.push({
          bar: draw.rect(memberLength,barSize).move(firstNodeCoords[0],firstNodeCoords[1]-barSize/2).rotate(-angle,firstNodeCoords[0],firstNodeCoords[1]).fill({color:barColor})
        });
      }else {
        this.displayBars.push({
          bar: draw.rect(memberLength,barSize).move(firstNodeCoords[0],firstNodeCoords[1]-barSize).rotate(-angle,firstNodeCoords[0],firstNodeCoords[1]).fill({color:barColor, opacity: 0.6}).stroke({ color: "black", width: 1 })
        });
      }
    },engine);
    this.displayNumbers.push({number: draw.text("Blue = Tension (T)").move(drawingBoardWidth-200,10).font({size:15, weight:'bold'}).fill("blue")});
    this.displayNumbers.push({number: draw.text("Pink = Compression (C)").move(drawingBoardWidth-200,28).font({size:15, weight:'bold'}).fill("#EA2DDF")});
    this.nodeDisplay();
    this.elementDisplay();
  },
  eraseStressDisplay: function(){
    if (this.displayBars.length !== 0){
      this.displayBars.forEach(function(each){
        each.bar.hide();
        each.bar.remove();
      });
      this.displayBars = [];
       this.displayNumbers.forEach(function(each){
        each.number.hide();
        each.number.remove();
      });
      this.displayNumbers = [];
    }
  },
  stressTable:function(){
    this.eraseStressTable();
     // get the reference for the body
    var body = document.getElementsByTagName("body")[0];
    // creates a <table> element and a <tbody> element
    var tbl     = document.createElement("table");
    var tblBody = document.createElement("tbody");
    tbl.setAttribute("id","stressTable");
    // creating all cells
    var head = tbl.createTHead();
    var firstRow = document.createElement("tr");
    var elementNumberCell = document.createElement("th");
    var nodeNumberCell = document.createElement("th");
    var stressCell = document.createElement("th");
    elementNumberCell.appendChild(document.createTextNode(" "));
    nodeNumberCell.appendChild(document.createTextNode("Nodes"));
    stressCell.appendChild(document.createTextNode("Bar Stress"));
    firstRow.appendChild(elementNumberCell);
    firstRow.appendChild(nodeNumberCell);
    firstRow.appendChild(stressCell);
    head.appendChild(firstRow);
    for (var i = 0; i < this.elements.length; i++) {
      // creates a table row
      var row = document.createElement("tr");
      for (var j = 0; j < 3; j++) {
        // Create a <td> element and a text node, make the text
        // node the contents of the <td>, and put the <td> at
        // the end of the table row
        var cell = document.createElement("td");
        var cellText;
        var stress;
        if(j===0){
          cellText = document.createTextNode(i+1);
        } else if (j===1){
          cellText = document.createTextNode(this.elements[i][0]+", "+this.elements[i][1]);
          cell.style.textAlign = "center";
        } else {
          cellText = document.createTextNode(this.barStressArray[i]);
        }
        cell.appendChild(cellText);
        row.appendChild(cell);
      }
   
      // add the row to the end of the table body
      tblBody.appendChild(row);
    }
   
    // put the <tbody> in the <table>
    tbl.appendChild(tblBody);
    // appends <table> into <body>
    body.appendChild(tbl);
    // sets the border attribute of tbl to 2;
    tbl.setAttribute("border", "2");
    tbl.style.zIndex = 3;
    tbl.style.position = 'absolute';
    tbl.style.left = "920px";
    tbl.style.top = "275px";
    tbl.style.width = "200px";
    tbl.style.backgroundColor = "white";
  },
  eraseStressTable:function(){
    if(document.getElementById("stressTable") !== null){
      document.getElementsByTagName("body")[0].removeChild(document.getElementById("stressTable"));
    } 
  },
  
  reactionDisplay:function(){
    var reactionArray = math.subtract(jointForce,engine.loadVector).valueOf();
    var totalReaction = 0;
    var reactionNumber = 0;
    reactionArray.forEach(function(reaction,index,array){
      if(math.abs(reaction)<1e-7){
        array[index] = 0;
      } else {
        totalReaction+=math.abs(reaction);
        reactionNumber++;
      }
    });
    var avgReaction = totalReaction/reactionNumber;
    reactionArray.forEach(function(element,index,array){
      if(element !== 0){
        index = Number(index);
        var reactionSize = (math.abs(element)/avgReaction-1)*30+60;
        if (reactionSize > 160){
          reactionSize = 160;
        }
        var nodeNumber = math.floor((index+2)/2);
        var nodeTrussCoord = this.nodes[nodeNumber];
        //convert truss coords into svg coords
        var nodeSvgCoord = [nodeTrussCoord[0]+originXvalue, originYvalue - nodeTrussCoord[1]];
        if (math.isInteger((index+2)/2) === true) {//which means it is the x direction reaction force
          if(element > 0){//meaning it is pointing right
            engine.reactionArrows.push({
              img: draw.image("green-right-arrow.svg").size(reactionSize,reactionSize).move(nodeSvgCoord[0]-reactionSize-20,nodeSvgCoord[1]-reactionSize*0.5).front(),
              background: draw.rect(40,12).fill("white").move(nodeSvgCoord[0]-reactionSize-20-2,nodeSvgCoord[1]-reactionSize*0.4-3.5),
              number: draw.text(element.toPrecision(6).toString()).move(nodeSvgCoord[0]-reactionSize-20,nodeSvgCoord[1]-reactionSize*0.4).front().font({size:10}).fill({color:"#138B29"})
            });
          } else {//pointing left
            engine.reactionArrows.push({
              img: draw.image("green-left-arrow.svg").size(reactionSize,reactionSize).move(nodeSvgCoord[0]+reactionSize*0.3,nodeSvgCoord[1]-reactionSize*0.5).front(),
              background: draw.rect(40,12).fill("white").move(nodeSvgCoord[0]+reactionSize*0.45-2,nodeSvgCoord[1]-reactionSize*0.4-3.5),
              number: draw.text(element.toPrecision(6).toString()).move(nodeSvgCoord[0]+reactionSize*0.45,nodeSvgCoord[1]-reactionSize*0.4).front().font({size:10}).fill({color:"#138B29"})
            });
          }
        } else {//y direction force
          if(element > 0){//meaning it is pointing up
            engine.reactionArrows.push({
              img: draw.image("green-up-arrow.svg").size(reactionSize,reactionSize).move(nodeSvgCoord[0]-reactionSize*0.5,nodeSvgCoord[1]+25).front(),
              background: draw.rect(40,12).fill("white").move(nodeSvgCoord[0]+reactionSize*0.1-2,nodeSvgCoord[1]+25+reactionSize*0.4-3.5),
              number: draw.text(element.toPrecision(6).toString()).move(nodeSvgCoord[0]+reactionSize*0.1,nodeSvgCoord[1]+25+reactionSize*0.4).front().font({size:10}).fill({color:"#138B29"})
            });
          } else {//pointing down
            engine.reactionArrows.push({
              img: draw.image("green-down-arrow.svg").size(reactionSize,reactionSize).move(nodeSvgCoord[0]-reactionSize*0.5,nodeSvgCoord[1]-reactionSize*1.2).front(),
              background: draw.rect(40,12).fill("white").move(nodeSvgCoord[0]+reactionSize*0.1-2,nodeSvgCoord[1]-reactionSize*0.7-3.5),
              number: draw.text(element.toPrecision(6).toString()).move(nodeSvgCoord[0]+reactionSize*0.1,nodeSvgCoord[1]-reactionSize*0.7).front().font({size:10}).fill({color:"#138B29"})
            });
          }
        }
      }
    },engine);
  },
  eraseReactionDisplay:function(){
    if(this.reactionArrows.length !== 0){
      this.reactionArrows.forEach(function(arrow){
        arrow.img.hide();
        arrow.img.remove();
        arrow.background.hide();
        arrow.background.remove();
        arrow.number.hide();
        arrow.number.remove();
      },engine);
      this.reactionArrows=[];
    }
  },
  
  displacementDisplay:function(){
    this.stopDisplaying();
    engine.compute();
    this.nodeDisplay();
    this.displacementTable();
    this.newNodes = {};
    displacementLines = [];
    var nodesKeys = Object.keys(this.nodes);
    
    //
    var nonZeroAbsDisplacements = [];
    displacement.forEach(function(each){
      if(each !== 0){
        nonZeroAbsDisplacements.push(math.abs(each));
      }
    });
    var minDisplacement = Math.min.apply(null, nonZeroAbsDisplacements);
    var maxDisplacement = Math.max.apply(null, nonZeroAbsDisplacements);
    var graphSlope = 35/(maxDisplacement-minDisplacement);
    //
    nodesKeys.forEach(function(key){//get the displaced new node coords(exaggerated)
      key = Number(key);
      var amplifiedDisplacementX;
      var amplifiedDisplacementY;
      amplifiedDisplacementX = (math.abs(displacement[2*key-2])-minDisplacement)*graphSlope+5;
      amplifiedDisplacementY = (math.abs(displacement[2*key-1])-minDisplacement)*graphSlope+5;
      
      if (displacement[2*key-2] === 0){// make sure 0 displacement means 0
        amplifiedDisplacementX = 0;
      }
      if (displacement[2*key-1] === 0){// make sure 0 displacement means 0
        amplifiedDisplacementY = 0;
      }
      if (displacement[2*key-2] < 0){//make sure the negativity of displacement is represented
        amplifiedDisplacementX = - amplifiedDisplacementX;
      } 
      if (displacement[2*key-1] < 0){//make sure the negativity of displacement is represented
        amplifiedDisplacementY = - amplifiedDisplacementY;
      } 
      this.newNodes[key] = addArray(this.nodes[key],[amplifiedDisplacementX,amplifiedDisplacementY]);//this is truss coords
    },engine);
    this.elements.forEach(function(element){//draw the new truss with new coords
      var firstNode = this.newNodes[element[0]];
      var lastNode = this.newNodes[element[1]];
      //convert truss coords into svg coords
      firstNode = [firstNode[0]+originXvalue, originYvalue - firstNode[1]];
      lastNode = [lastNode[0]+originXvalue, originYvalue - lastNode[1]];
      this.displacementLines.push({
        line: draw.line(firstNode[0],firstNode[1],lastNode[0],lastNode[1]).stroke({width:1 , color:"#5A8ED4"}).front()
        });
    },engine);
  },
  eraseDisplacementDisplay: function(){
    if (this.displacementLines.length !== 0){
      this.displacementLines.forEach(function(each){
        each.line.hide();
        each.line.remove();
      },engine);
      this.displacementLines = [];
    }
  },
  displacementTable:function(){
    this.eraseDisplacementTable();
    // get the reference for the body
    var body = document.getElementsByTagName("body")[0];
    // creates a <table> element and a <tbody> element
    var tbl     = document.createElement("table");
    var tblBody = document.createElement("tbody");
    tbl.setAttribute("id","displacementTable");
    // creating all cells
    var head = tbl.createTHead();
    var firstRow = document.createElement("tr");
    var nodeNumberCell = document.createElement("th");
    var displacementCell = document.createElement("th");
    nodeNumberCell.appendChild(document.createTextNode("Node"));
    displacementCell.appendChild(document.createTextNode("Displacement"));
    firstRow.appendChild(nodeNumberCell);
    firstRow.appendChild(displacementCell);
    head.appendChild(firstRow);
    for (var i = 0; i < numberOfNodes; i++) {
      // creates a table row
      var row = document.createElement("tr");
      for (var j = 0; j < 2; j++) {
        // Create a <td> element and a text node, make the text
        // node the contents of the <td>, and put the <td> at
        // the end of the table row
        var cell = document.createElement("td");
        var cellText;
        var xDisp;
        var yDisp;
        if(j===0){
          cellText = document.createTextNode(i+1);
        } else{
          if(displacement[2*i]===0){
            xDisp = 0.00;
          } else if(math.abs(displacement[2*i])<1e-4){
            xDisp = displacement[2*i].toExponential(4);
          } else {
            xDisp = displacement[2*i].toPrecision(4);
          }
          if(displacement[2*i+1]===0){
            yDisp = 0.00;
          } else if(math.abs(displacement[2*i+1])<1e-4){
            yDisp = displacement[2*i+1].toExponential(4);
          } else {
            yDisp = displacement[2*i+1].toPrecision(4);
          }
          cellText = document.createTextNode("("+ xDisp +","+ yDisp +")");
        }
        cell.appendChild(cellText);
        row.appendChild(cell);
      }
   
      // add the row to the end of the table body
      tblBody.appendChild(row);
    }
   
    // put the <tbody> in the <table>
    tbl.appendChild(tblBody);
    // appends <table> into <body>
    body.appendChild(tbl);
    // sets the border attribute of tbl to 2;
    tbl.setAttribute("border", "2");
    tbl.style.zIndex = 3;
    tbl.style.position = 'absolute';
    tbl.style.left = "920px";
    tbl.style.top = "275px";
    tbl.style.width = "200px";
    tbl.style.backgroundColor = "white";
  },
  eraseDisplacementTable:function(){
    if(document.getElementById("displacementTable") !== null){
      document.getElementsByTagName("body")[0].removeChild(document.getElementById("displacementTable"));
    }
  },
  
  nodeDisplay:function(){
    this.eraseNodeDisplay();
    this.getNodes();
    this.eraseElementTable();
    var nodesKeys = Object.keys(this.nodes);
    nodesKeys.forEach(function(key){
      var nodeTrussCoord = this.nodes[key];
      var nodeScreenCoord = [nodeTrussCoord[0]+originXvalue, originYvalue - nodeTrussCoord[1]];
      if(key.toString().length == 1){//if it is a one digit number
        this.nodeNumberDisplay.push({
          background: draw.circle(20).move(nodeScreenCoord[0]+4.5,nodeScreenCoord[1]-22).fill("#F7F506").stroke({color:'black',width:2}).front(),
          number: draw.text(key).move(nodeScreenCoord[0]+10,nodeScreenCoord[1]-20).font({size:15}).front()
        });
      } else {//else meaning the key is two digits
        this.nodeNumberDisplay.push({
          background: draw.ellipse(29,20).move(nodeScreenCoord[0]+4.5,nodeScreenCoord[1]-22).fill("#F7F506").stroke({color:'black',width:2}).front(),
          number: draw.text(key).move(nodeScreenCoord[0]+10,nodeScreenCoord[1]-20).font({size:15}).front()
        });
      }
    },engine);
  },
  eraseNodeDisplay: function(){
    if (this.nodeNumberDisplay.length!== 0){
      this.nodeNumberDisplay.forEach(function(each){
        each.background.hide();
        each.background.remove();
        each.number.hide();
        each.number.remove();
      });
      this.nodeNumberDisplay = [];
    }
  },
  nodeTable:function(){
    this.eraseNodeTable();
    // get the reference for the body
    var body = document.getElementsByTagName("body")[0];
    // creates a <table> element and a <tbody> element
    var tbl     = document.createElement("table");
    var tblBody = document.createElement("tbody");
    tbl.setAttribute("id","nodeTable");
    // creating all cells
    var head = tbl.createTHead();
    var firstRow = document.createElement("tr");
    var nodeNumberCell = document.createElement("th");
    var coordsCell = document.createElement("th");
    nodeNumberCell.appendChild(document.createTextNode("Node"));
    coordsCell.appendChild(document.createTextNode("Coordinates"));
    firstRow.appendChild(nodeNumberCell);
    firstRow.appendChild(coordsCell);
    head.appendChild(firstRow);
    for (var i = 0; i < numberOfNodes; i++) {
      // creates a table row
      var row = document.createElement("tr");
      for (var j = 0; j < 2; j++) {
        // Create a <td> element and a text node, make the text
        // node the contents of the <td>, and put the <td> at
        // the end of the table row
        var cell = document.createElement("td");
        var cellText;
        var xCoord = (this.nodes[i+1][0]/scaleRatio).toFixed(3);
        var yCoord = (this.nodes[i+1][1]/scaleRatio).toFixed(3);
        if(j===0){
          cellText = document.createTextNode(i+1);
        } else{
          cellText = document.createTextNode("("+ xCoord +","+ yCoord +")");
        }
        cell.appendChild(cellText);
        row.appendChild(cell);
      }
   
      // add the row to the end of the table body
      tblBody.appendChild(row);
    }
   
    // put the <tbody> in the <table>
    tbl.appendChild(tblBody);
    // appends <table> into <body>
    body.appendChild(tbl);
    // sets the border attribute of tbl to 2;
    tbl.setAttribute("border", "2");
    tbl.style.zIndex = 3;
    tbl.style.position = 'absolute';
    tbl.style.left = "920px";
    tbl.style.top = "275px";
    tbl.style.width = "200px";
    tbl.style.backgroundColor = "white";
  },
  eraseNodeTable:function(){
    if(document.getElementById("nodeTable") !== null){
      document.getElementsByTagName("body")[0].removeChild(document.getElementById("nodeTable"));
    }
  },
  
  elementDisplay:function(){
    this.eraseElementDisplay();
    this.getElements();
    this.nodeDisplay();
    this.eraseNodeTable();
    this.elements.forEach(function(member,index){//draw the square and member number
      var firstNodeCoords = math.clone(this.nodes[member[0]]);
      var lastNodeCoords = math.clone(this.nodes[member[1]]);
      firstNodeCoords = [originXvalue + firstNodeCoords[0],originYvalue - firstNodeCoords[1]];//change truss coords to screen coords
      lastNodeCoords =  [originXvalue + lastNodeCoords[0],originYvalue - lastNodeCoords[1]];
      //var halfwayCoords = [(firstNodeCoords[0]+lastNodeCoords[0])/2,(firstNodeCoords[1]+lastNodeCoords[1])/2];
      var oneThirdCoords = [firstNodeCoords[0]+(lastNodeCoords[0]-firstNodeCoords[0])*2/3-5,firstNodeCoords[1]+(lastNodeCoords[1]-firstNodeCoords[1])*2/3-5];
      if((Number(index)+1).toString().length == 1){
        this.elementNumberDisplay.push({
          background: draw.rect(15,15).move(oneThirdCoords[0]-3,oneThirdCoords[1]).fill("#0CBEF0").stroke({color:'black',width:2}).front(),
          number: draw.text((Number(index)+1).toString()).move(oneThirdCoords[0],oneThirdCoords[1]).font({size:15}).front()
        });
      } else {
        this.elementNumberDisplay.push({
          background: draw.rect(25,15).move(oneThirdCoords[0]-3,oneThirdCoords[1]).fill("#0CBEF0").stroke({color:'black',width:2}).front(),
          number: draw.text((Number(index)+1).toString()).move(oneThirdCoords[0],oneThirdCoords[1]).font({size:15}).front()
        });
      }
      
    },engine);
  },
  eraseElementDisplay:function(){
    if (this.elementNumberDisplay.length!== 0){
      this.elementNumberDisplay.forEach(function(each){
        each.background.hide();
        each.background.remove();
        each.number.hide();
        each.number.remove();
      });
      this.elementNumberDisplay = [];
    }
  },
  elementTable: function(){
    this.eraseElementTable();
     // get the reference for the body
    var body = document.getElementsByTagName("body")[0];
    // creates a <table> element and a <tbody> element
    var tbl     = document.createElement("table");
    var tblBody = document.createElement("tbody");
    tbl.setAttribute("id","elementTable");
    // creating all cells
    var head = tbl.createTHead();
    var firstRow = document.createElement("tr");
    var elementNumberCell = document.createElement("th");
    var nodeNumberCell = document.createElement("th");
    var areaCell = document.createElement("th");
    var eCell = document.createElement("th");
    elementNumberCell.appendChild(document.createTextNode(" "));
    nodeNumberCell.appendChild(document.createTextNode("Nodes"));
    areaCell.appendChild(document.createTextNode("A"));
    eCell.appendChild(document.createTextNode("E"));
    firstRow.appendChild(elementNumberCell);
    firstRow.appendChild(nodeNumberCell);
    firstRow.appendChild(areaCell);
    firstRow.appendChild(eCell);
    head.appendChild(firstRow);
    for (var i = 0; i < this.elements.length; i++) {
      // creates a table row
      var row = document.createElement("tr");
      for (var j = 0; j < 4; j++) {
        // Create a <td> element and a text node, make the text
        // node the contents of the <td>, and put the <td> at
        // the end of the table row
        var cell = document.createElement("td");
        var cellText;
        var area;
        var e;
        if(j===0){
          cellText = document.createTextNode(i+1);
        } else if (j===1){
          cellText = document.createTextNode(this.elements[i][0]+", "+this.elements[i][1]);
          cell.style.textAlign = "center";
        } else if (j===2){
          cellText = document.createTextNode(this.elements[i][2]);
        } else {
          cellText = document.createTextNode(this.elements[i][3]);
        }
        cell.appendChild(cellText);
        row.appendChild(cell);
      }
   
      // add the row to the end of the table body
      tblBody.appendChild(row);
    }
   
    // put the <tbody> in the <table>
    tbl.appendChild(tblBody);
    // appends <table> into <body>
    body.appendChild(tbl);
    // sets the border attribute of tbl to 2;
    tbl.setAttribute("border", "2");
    tbl.style.zIndex = 3;
    tbl.style.position = 'absolute';
    tbl.style.left = "920px";
    tbl.style.top = "275px";
    tbl.style.width = "200px";
    tbl.style.backgroundColor = "white";
  },
  eraseElementTable: function(){
    if(document.getElementById("elementTable") !== null){
      document.getElementsByTagName("body")[0].removeChild(document.getElementById("elementTable"));
    } 
  },
  
  cutListTable: function(){
    this.eraseCutListTable();
    var div = document.createElement("div");
    div.setAttribute("id","cutListDiv");
    var html = "<h3>Machining Cut List</h3>" +
      "<p>Lengths are center-to-center (unit: " + scaleUnit + "). Tension members are flat bar, compression members are square stock. " +
      "Rough cut = length + offset, finish = length + offset (use negative numbers to subtract).</p>" +
      "<p>Tension: rough <input type='number' step='0.01' class='offsetInput' id='tRough' value='" + cutOffsets.tRough + "'> " +
      "finish <input type='number' step='0.01' class='offsetInput' id='tFinish' value='" + cutOffsets.tFinish + "'> " +
      "&nbsp; Compression: rough <input type='number' step='0.01' class='offsetInput' id='cRough' value='" + cutOffsets.cRough + "'> " +
      "finish <input type='number' step='0.01' class='offsetInput' id='cFinish' value='" + cutOffsets.cFinish + "'> " +
      "<button onclick='engine.downloadCutList()'>Download CSV</button></p>";
    html += "<table border='2'><thead><tr><th>Member</th><th>Nodes</th><th>From (x, y)</th><th>To (x, y)</th><th>Length c-c</th><th>T or C</th><th>Force</th><th>Rough Cut</th><th>Finish Length</th></tr></thead><tbody>";
    this.cutListRows().forEach(function(r){
      var color = r.tc == "T" ? "#D6E4FF" : (r.tc == "C" ? "#FBD3F8" : "white");
      html += "<tr style='background-color:" + color + "'><td>" + r.member + "</td><td>" + r.nodes + "</td><td>" + r.from + "</td><td>" + r.to +
        "</td><td>" + r.length + "</td><td><b>" + r.tcLabel + "</b></td><td>" + r.force + "</td><td>" + r.rough + "</td><td>" + r.finish + "</td></tr>";
    });
    html += "</tbody></table>";
    div.innerHTML = html;
    document.getElementsByTagName("body")[0].appendChild(div);
    ["tRough","tFinish","cRough","cFinish"].forEach(function(id){
      document.getElementById(id).onchange = function(){
        cutOffsets[id] = Number(this.value);
        engine.cutListTable();
      };
    });
  },
  cutListRows: function(){
    var rows = [];
    this.elements.forEach(function(member,i){
      var a = this.nodes[member[0]];
      var b = this.nodes[member[1]];
      var length = Math.sqrt(Math.pow(a[0]-b[0],2)+Math.pow(a[1]-b[1],2))/scaleRatio;
      var f = Number(this.barForceArray[i]);
      // zero-force members get cut like tension members (flat bar)
      var tc = f > 0 ? "T" : (f < 0 ? "C" : "0");
      var rough = length + (tc == "C" ? cutOffsets.cRough : cutOffsets.tRough);
      var finish = length + (tc == "C" ? cutOffsets.cFinish : cutOffsets.tFinish);
      rows.push({
        member: i+1,
        nodes: member[0] + ", " + member[1],
        from: "(" + (a[0]/scaleRatio).toFixed(2) + ", " + (a[1]/scaleRatio).toFixed(2) + ")",
        to: "(" + (b[0]/scaleRatio).toFixed(2) + ", " + (b[1]/scaleRatio).toFixed(2) + ")",
        length: length.toFixed(2),
        tc: tc,
        tcLabel: tc == "T" ? "Tension" : (tc == "C" ? "Compression" : "Zero force"),
        force: Math.abs(f).toFixed(2),
        rough: rough.toFixed(2),
        finish: finish.toFixed(2)
      });
    },engine);
    return rows;
  },
  downloadCutList: function(){
    var csv = "Member,Nodes,From,To,Length c-c (" + scaleUnit + "),T or C,Force,Rough Cut,Finish Length\n";
    this.cutListRows().forEach(function(r){
      csv += [r.member, '"' + r.nodes + '"', '"' + r.from + '"', '"' + r.to + '"', r.length, r.tcLabel, r.force, r.rough, r.finish].join(",") + "\n";
    });
    saveAs(new File([csv], "cut-list.csv", {type: "text/csv;charset=utf-8"}));
  },
  eraseCutListTable: function(){
    if(document.getElementById("cutListDiv") !== null){
      document.getElementsByTagName("body")[0].removeChild(document.getElementById("cutListDiv"));
    }
  },

  stopDisplaying: function(){
    this.eraseCutListTable();
    this.eraseNodeDisplay();
    this.eraseNodeTable();
    this.eraseElementDisplay();
    this.eraseElementTable();
    this.eraseForceDisplay();
    this.eraseForceTable();
    this.eraseStressDisplay();
    this.eraseStressTable();
    this.eraseReactionDisplay();
    this.eraseDisplacementDisplay();
    this.eraseDisplacementTable();
  }
};


displaySync = {
  node: function(){
    engine.nodeDisplay();
    engine.nodeTable();
  },
  startNode: function(){
    if(nodeSyncInterval === false){
      nodeSyncInterval = window.setInterval(displaySync.node,500);
    }
  },
  stopNode: function(){
    if(nodeSyncInterval !== false){
      clearInterval(nodeSyncInterval);
      nodeSyncInterval = false;
      engine.eraseNodeTable();
    }
  },
  element: function(){
    engine.elementDisplay();
    engine.elementTable();
  },
  startElement:function(){
    if(elementSyncInterval === false){
      elementSyncInterval =  window.setInterval(displaySync.element,500);
    }
  },
  stopElement: function(){
    if(elementSyncInterval !== false){
      clearInterval(elementSyncInterval);
      elementSyncInterval = false;
      engine.eraseElementTable();
    }
  }
};
var nodeSyncInterval = window.setInterval(displaySync.node,500);
var elementSyncInterval = false;

// machining offsets from the lab spreadsheet (inches)
var cutOffsets = {tRough: 1.30, tFinish: 1.25, cRough: -4.13, cFinish: -4.25};

var analysisButtonHandlers = {
  node: function(){
    engine.nodeDisplay();
    engine.nodeTable();
    displaySync.startNode();
    displaySync.stopElement();
  },
  element: function(){
    engine.elementDisplay();
    engine.elementTable();
    displaySync.startElement();
    displaySync.stopNode();
  },
  force: function(){
    engine.forceDisplay();
    engine.forceTable();
    engine.cutListTable();
    displaySync.stopNode();
    displaySync.stopElement();
  },
  stress: function(){
    engine.stressDisplay();
    engine.stressTable();
    displaySync.stopNode();
    displaySync.stopElement();
  },
  reaction: function(){
    engine.reactionDisplay();
    displaySync.stopNode();
    displaySync.stopElement();
  },
  displacement: function(){
    engine.displacementDisplay();
    displaySync.stopNode();
    displaySync.stopElement();
  },
  stopDisplaying: function(){
    engine.stopDisplaying();
    displaySync.stopNode();
    displaySync.stopElement();
  }
};

//saving and loading files

var content;

function saveFile(content){
  var file = new File([content], "truss-data.txt", {type: "text/plain;charset=utf-8"});
  saveAs(file);
}

var filePoints;
var fileLineProp;
var fileHiddenLines;
var fileSet;
var fileLoad;
var fileSupport;
var fileResult;

var saveAndOpen = {
  save:function(){
    //points
    content = "filePoints = [";
    jointPoints.points.forEach(function(point){
      content = content.concat(point.xValue,",",point.yValue,",");
    });
    content = content.slice(0,-1);
    content = content.concat("]; ");
    //hide hidden lines
    content = content.concat("fileHiddenLines = [");
    jointPoints.links.forEach(function(link,index,array){
      if(link.line.visible()===false){
        content = content.concat(Number(index),",");
      }
    });
    if (content.slice(-1) == ","){
      content = content.slice(0,-1);
    }
    content = content.concat("]; ");
    //get line properties(A and E)
    content = content.concat("fileLineProp = {");
    jointPoints.links.forEach(function(link,index,array){
      if(typeof link.area !=="undefined"){
        content = content.concat(index+":"+"["+link.area.toString()+","+link.e.toString()+"],");
      }
    });
    if (content.slice(-1) == ","){
      content = content.slice(0,-1);
    }
    content = content.concat("}; ");
    //set dependency
    content = content.concat("fileSet = [");
    content = content.concat(dependency.toString());
    content = content.concat("]; ");
    //scale unit and ratio
    content = content.concat("scaleValue = "+scaleValue.toString()+"; ");
    //get load
    content = content.concat("fileLoad = {");
    jointPoints.points.forEach(function(each,index){
      if (each.load.every(isZero) === false) {
         content = content.concat(index+":"+"["+each.load.toString()+"],");
      }
    });
    if (content.slice(-1) == ","){
      content = content.slice(0,-1);
    }
    content = content.concat("}; ");
    //get Support
    content = content.concat("fileSupport = {");
    jointPoints.points.forEach(function(each,index){
      if(typeof each.support !== "undefined"){
        content = content.concat(index+":"+'"'+each.support.toString()+'"'+",");
      }
    });
    if (content.slice(-1) == ","){
      content = content.slice(0,-1);
    }
    content = content.concat("}; ");
    
    saveFile(content);
  },
  read: function(){
    //get filePoints, fileLineProp, fileHiddenLines, fileSupport, fileLoad
    
    eval(fileResult);//POTENTIAL DANGER:since user can upload bad code and hack the page.
                     //But javascript code can only mess up client side. No damage can be done on the server.
    
    //set the scale
    document.getElementById("scaleInput").value = scaleValue;

    //adding the points
    for(i = 0;i<filePoints.length/2;i++){
      jointPoints.addPoint(filePoints[2*i],filePoints[2*i+1]);
      hitButton++;
    }
    handlers.updateCircleIdArray();//update circleIdArray
    //setting dependencies
    for(i = 0;i<fileSet.length/2;i++){
      jointPoints.sets.push({
        set: draw.set().add(jointPoints.points[fileSet[2*i]].circle, jointPoints.points[fileSet[2*i+1]].circle),
        setXvalue: jointPoints.points[fileSet[2*i]].xValue,
        setYvalue: jointPoints.points[fileSet[2*i]].yValue
      });
    }
    dependency = fileSet;
    //hiding the hidden lines
    fileHiddenLines.forEach(function(element){
      jointPoints.links[element].line.hide();
    });
    //also delete lone dots from the hidden lines
    if (typeof jointPoints.links[0] ==="undefined"){
      if (typeof jointPoints.points[0] !=="undefined"){
        jointPoints.points[0].circle.hide();}
    } else if (jointPoints.links[0].line.visible() === false) { //if the first line is hidden, hide the first dot
      jointPoints.points[0].circle.hide();
    }
    if (jointPoints.links[jointPoints.links.length - 1].line.visible() === false) { //if the last line is hidden, hide the last dot
      jointPoints.points[jointPoints.points.length - 1].circle.hide();
    }
    for (var i = 0; i < jointPoints.links.length - 1; i++) { //if two consecutive lines are hidden, hide the middle dot
      if (jointPoints.links[i].line.visible() === false && jointPoints.links[i + 1].line.visible() === false) {
        jointPoints.points[i + 1].circle.hide();
      }
    }
    //add load
    var fileLoadKeys = Object.keys(fileLoad);
    fileLoadKeys.forEach(function(key){
      for(i = 0; i<4 ;i++){
        if(fileLoad[key][i] !== 0){
          jointPoints.addLoad(key,i,fileLoad[key][i]);
        }
      }
    });
    //add support
    var fileSupportKeys = Object.keys(fileSupport);
    fileSupportKeys.forEach(function(key){
      jointPoints.addSupport(key,fileSupport[key]);
    });
    //add member properties
    var fileLinePropKeys = Object.keys(fileLineProp);
    fileLinePropKeys.forEach(function(key){
      var sectionArea = fileLineProp[key][0];
      var color;
      if(sectionArea in areaColor){// check whether the area is the same with existing line color areas
        color = areaColor[sectionArea];
      } else {//if not push it in
        color = availableColor[0];
        areaColor[sectionArea] = availableColor[0];
        availableColor = availableColor.slice(1,availableColor.length).concat(availableColor[0]);
      }
      jointPoints.links[key].area = sectionArea;//set the member section area
      jointPoints.links[key].line.attr({stroke:color});//set the line to be colored
      
      jointPoints.links[key].e = fileLineProp[key][1];//set the young's modulus of the member
      
    });
  },
  clean: function(){
    window.location.reload(false); 
  }
};

window.onload = function() {//prepare the file result when file is loaded
  var fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', function(e) {
    var file = fileInput.files[0];
    var textType = /text.*/;
    if (file.type.match(textType)) {
      var reader = new FileReader();
      reader.onload = function(e) {
        fileResult = reader.result;
      };
      reader.readAsText(file);   
    }
  });
};

