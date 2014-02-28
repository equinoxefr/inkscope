/**
 * Created by Alain Dechorgnat on 24/02/14.
 */
var osdMapApp = angular.module('osdMapApp', [])
    .filter('duration', funcDurationFilter);


osdMapApp.controller('OsdMapCtrl', function OsdMapCtrl($scope, $http) {
    $scope.osds = [];
    $scope.dispoModes = ["up/down", "in/out" , "free space (%)"];
    $scope.dispoMode = "up/down";
    $scope.osdControl = 0;
    $scope.warningMessage = "";

    // get OSD info and refresh every 10s
    getOsds();
    setInterval(function () {getOsds()},10*1000);

    // Prepare OSD topology from crushmap
    var w = window, d = document, e = d.documentElement, g = d.getElementsByTagName('body')[0];
    $scope.screenSize = {"x": w.innerWidth || e.clientWidth || g.clientWidth, "y": w.innerHeight || e.clientHeight || g.clientHeight};

    var svg = d3.select("body").select("#put_the_graph_there")
        .attr("width", $scope.screenSize.x - 40)
        .attr("height", $scope.screenSize.y - 200);


    $http({method: "get", url: cephRestApiURL + "osd/crush/dump.json"}).
        success(function (data, status) {
            $scope.status = status;
            $scope.types = data.output.types;
            $scope.devices = data.output.devices;
            $scope.buckets = computeBucketsTree(data.output.buckets);
        }).
        error(function (data, status) {
            $scope.status = status;
        });

    function computeBucketsTree(rawbuckets) {
        var bucketsTab = [];
        var osdTab = [];

        // make array of buckets with bucket id as index
        for (var i = 0; i < rawbuckets.length; i++) {
            bucketsTab[rawbuckets[i].id] = rawbuckets[i];
        }
        // device's name for OSD (id >=0)
        for (var i = 0; i < $scope.devices.length; i++) {
            osdTab[$scope.devices[i].id] = $scope.devices[i].name;
        }
        // init tab with  bucket with id -1 as root
        var buckets = bucketsTab[-1];

        //recursively make the tree of buckets for the D3 sunburst viz
        addChildren(buckets);
        //console.error(JSON.stringify(buckets));
        return buckets;

        function addChildren(bucket) {
            bucket.dispo = 1.0;
            bucket.children = [];
            for (var j = 0; j < bucket.items.length; j++) {
                var item = bucket.items[j];
                if (item.id < 0) {
                    //item is not an OSD
                    bucket.children.push(bucketsTab[item.id]);
                    addChildren(bucketsTab[item.id]);
                }
                else {
                    //item is an OSD
                    var osd = item;
                    osd.name = osdTab[item.id];
                    //compute dispo if data is available
                    if (typeof $scope.osds[item.id] !== 'undefined') {
                        osd.dispo = $scope.dispo($scope.osds[item.id]);
                    }
                    else
                        osd.dispo = -1.0; //"unknown"
                    bucket.children.push(osd);
                }
            }
        }
    }

    function getOsds() {
        $http({method: "get", url: inkscopeCtrlURL + "ceph/osd?depth=2"})
            .success(function (data, status) {
                $scope.date = new Date();
                $scope.status = status;
                $scope.osds = [];
                $scope.osdOut = 0;
                $scope.osdDown = 0;
                $scope.warningMessage = "";
                for (var i = 0; i < data.length; i++) {
                    data[i].id = data[i].node._id;
                    if (!data[i].stat.in) $scope.osdOut++;
                    if (!data[i].stat.up) $scope.osdDown++;
                    data[i].lastControl = ((+$scope.date) - data[0].stat.timestamp) / 1000;
                    try {
                        data[i].free = data[i].partition.stat.free;
                        data[i].total = data[i].partition.stat.total;
                    }
                    catch (e) {
                        data[i].free = -1;
                        data[i].total = -1;
                    }
                    $scope.osds[data[i].id] = data[i];
                }
                if ($scope.osdDown >0) $scope.warningMessage += " OSD down : "+$scope.osdDown ;
                if ($scope.osdOut >0)  $scope.warningMessage = $scope.warningMessage ==''? " OSD out : "+$scope.osdOut : $scope.warningMessage +" / OSD out : "+$scope.osdOut ;
                $scope.osdControl = data[0].lastControl;
                //console.log(JSON.stringify($scope.osds));
                $scope.refreshStatusDisplay();
            })
            .error(function (data, status) {
                $scope.status = status;
                $scope.data = data || "Request failed";
            });
    }

    function dispo(node) {
        if (typeof node === undefined) return -1;
        if ($scope.dispoMode == "up/down") return node.stat.up ? 1.0 : 0.0;
        if ($scope.dispoMode == "in/out") return node.stat.in ? 1.0 : 0.2;
        if ($scope.dispoMode == "free space (%)") return (node.free/node.total);
    }

    $scope.refreshStatusDisplay = function () {
        if ((typeof $scope.osds !== 'undefined') &&
            (typeof $scope.buckets !== 'undefined')) {
            for (var i = 0; i < $scope.osds.length; i++) {
                var path = d3.select("#osd" + $scope.osds[i].id);
                path.style("fill", color4ascPercent(dispo($scope.osds[i])));
            }
        }
    }

});


osdMapApp.directive('myTopology', function () {

    return {
        restrict: 'EA',
        terminal: true,
        link: function (scope, element, attrs) {


            function description(d) {
                var html = "";
                html += "<h2>" + d.name;
                if (d.id >=0) {//OSD state
                    var osdstate = (scope.osds[d.id].stat.in == true) ? "in / " : "out / ";
                    osdstate += (scope.osds[d.id].stat.up == true) ? "up" : "down";
                    html +=  "<br/>"+osdstate ;

                }
                html += "</h2>"

                html += "id : " + d.id + "<br />"
                html += "weight : " + d.weight + "<br />"
                if (typeof d.hash !== "undefined") {
                    html += "hash : " + d.hash + "<br />"
                }
                if (typeof d.alg !== "undefined") {
                    html += "alg : " + d.alg + "<br />"
                }
                if (typeof d.type_name !== "undefined") {
                    html += "type : " + d.type_name + "<br />"
                }
                if (typeof d.pos !== "undefined") {
                    html += "pos : " + d.pos + "<br />"
                }
                if (d.id >=0){
                    // OSD specific fields
                    html += "free space : " + funcBytes(scope.osds[d.id].free) + "<br />";
                    html += "total space : " + funcBytes(scope.osds[d.id].total) + "<br />";
                    html += "free : " +(scope.osds[d.id].free*100/scope.osds[d.id].total).toFixed(1) + "% <br />";
                }
                return html;
            }

            var w = window, d = document, e = d.documentElement, g = d.getElementsByTagName('body')[0];
            scope.screenSize = {"x": w.innerWidth || e.clientWidth || g.clientWidth, "y": w.innerHeight || e.clientHeight || g.clientHeight};

            var width = scope.screenSize.x - 40,
                height = scope.screenSize.y - 200,
                radius = Math.min(width, height) / 2 - 10;

            var x = d3.scale.linear()
                .range([0, 2 * Math.PI]);

            var y = d3.scale.linear()
                .range([0, radius]);

            var color = d3.scale.category20c();

            var svg = d3.select(element[0])
                .append("svg")
                .attr("width", width)
                .attr("height", height)
                .append("g")
                .attr("transform", "translate(" + width / 2 + "," + (height / 2 + 10) + ")");

            var divTooltip = d3.select("body").select("#tooltip");

            scope.$watch('buckets', function (topology, oldTopology) {

                // if 'topology' is undefined, exit
                if (typeof topology === 'undefined') {
                    return;
                }
                console.log("in watch");
                // clear the elements inside of the directive
                svg.selectAll('*').remove();
                var partition = d3.layout.partition()
                    .value(function (d) {
                        return d.weight;
                    });

                var arc = d3.svg.arc()
                    .startAngle(function (d) {
                        return Math.max(0, Math.min(2 * Math.PI, x(d.x)));
                    })
                    .endAngle(function (d) {
                        return Math.max(0, Math.min(2 * Math.PI, x(d.x + d.dx)));
                    })
                    .innerRadius(function (d) {
                        return Math.max(0, y(d.y));
                    })
                    .outerRadius(function (d) {
                        return Math.max(0, y(d.y + d.dy));
                    });

                var g = svg.selectAll("g")
                    .data(partition.nodes(topology))
                    .enter().append("g")
                    .on("click", click)
                    .on("mouseover", function (d) {
                        divTooltip.transition()
                            .duration(1000)
                            .style("opacity", .9);
                        divTooltip.html(description(d))
                            .style("left", (d3.event.pageX) + "px")
                            .style("top", (d3.event.pageY - 28) + "px")/**/;
                    })
                    .on("mouseout", function (d) {
                        divTooltip.transition()
                            .duration(1000)
                            .style("opacity", 0);
                    });

                var path = g.append("path")
                    .attr("d", arc)
                    .attr('id', function (d) {
                        return "osd" + d.id;
                    })
                    .style("fill", function (d) {
                        return color4ascPercent(d['dispo']);
                    })
                    .style("stroke", "#fff")
                    .style("stroke-width", "1");

                var text = g.append("text")
                    .attr("transform", function (d) {
                        return "rotate(" + computeTextRotation(d) + ")";
                    })
                    .attr("x", function (d) {
                        return y(d.y);
                    })
                    .attr("dx", "6") // margin
                    .attr("dy", ".35em") // vertical-align
                    .style("fill", "#fff")
                    .text(function (d) {
                        return d.name;
                    });

                function click(d) {
                    // fade out all text elements
                    text.transition().attr("opacity", 0);

                    path.transition()
                        .duration(750)
                        .attrTween("d", arcTween(d))
                        .each("end", function (e, i) {
                            // check if the animated element's data e lies within the visible angle span given in d
                            if (e.x >= d.x && e.x < (d.x + d.dx)) {
                                // get a selection of the associated text element
                                var arcText = d3.select(this.parentNode).select("text");
                                // fade in the text element and recalculate positions
                                arcText.transition().duration(750)
                                    .attr("opacity", 1)
                                    .attr("transform", function () {
                                        return "rotate(" + computeTextRotation(e) + ")"
                                    })
                                    .attr("x", function (d) {
                                        return y(d.y);
                                    });
                            }
                        });
                }

                d3.select(self.frameElement).style("height", height + "px");

                // Interpolate the scales!
                function arcTween(d) {
                    var xd = d3.interpolate(x.domain(), [d.x, d.x + d.dx]),
                        yd = d3.interpolate(y.domain(), [d.y, 1]),
                        yr = d3.interpolate(y.range(), [d.y ? 20 : 0, radius]);
                    return function (d, i) {
                        return i
                            ? function (t) {
                            return arc(d);
                        }
                            : function (t) {
                            x.domain(xd(t));
                            y.domain(yd(t)).range(yr(t));
                            return arc(d);
                        };
                    };
                }

                function computeTextRotation(d) {
                    return (x(d.x + d.dx / 2) - Math.PI / 2) / Math.PI * 180;
                }

                console.log("out watch");

            }, true);


        }
    }
})