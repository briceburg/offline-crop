$(function() {
    var canvas = document.createElement("canvas");
    document.body.appendChild(canvas);

    selectionCanvas = new SelectionCanvas({
        el: canvas
    });

    selections = new Selections();

    $(selections).on({
        saving: function() {
            $("#save-status").html(
                "<span class='glyphicon glyphicon-floppy-save'></span> Saving...");
        },

        saved: function(e, data) {
            fileQueue.loadData(data.result.images);

            $("#save-status").html(
                "<span class='glyphicon glyphicon-floppy-saved'></span> Saved!");
        },

        error: function() {
            $("#save-status").html(
                "<span class='glyphicon glyphicon-floppy-remove'></span> Error Saving.");
        }
    });

    // TODO: Update images when online (and sparingly?)
    // May need to swap cache. Also:
    // fileQueue.handleUpdatedQueue(data.result);

    var nextImage = function() {
        var nextFile = fileQueue.latest();

        if (!nextFile) {
            // TODO: Show some sort of error?
            // Get them to go online and re-sync, if offline.
            $("#sync-status").text("No more files! Reload.");
            return;
        }

        var curFile = nextFile.file;
        var file = "/images/scaled/" + curFile;

        selectionCanvas.loadImage(file, function(err) {
            if (err) {
                fileQueue.markDone();
                nextImage();
            } else {
                selections.start(curFile);
            }
        });
    };

    fileQueue = new FileQueue();

    fileQueue.getQueue(function() {
        nextImage();
    });

    $("#done").on("vclick", function() {
        fileQueue.markDone();
        selections.finish(selectionCanvas.computeSlice());
        nextImage();
    });

    var attemptSave = function() {
        $("#online-status").html(window.navigator.onLine ?
            "<span class='glyphicon glyphicon-ok-sign'></span> Online." :
            "<span class='glyphicon glyphicon-minus-sign'></span> Offline.");

        selections.save();
    };

    $(window).on("online", attemptSave);
    setInterval(attemptSave, 5000);
    attemptSave();
});

var loginRedirect = function() {
    window.location.href = "/login?returnTo=" +
        encodeURIComponent(window.location.pathname);
};

$("html").on("touchstart", function(e) {
    e.preventDefault();
});

$(window.applicationCache).on({
    updateready: function() {
        // Get the cache to update
        this.update();
        this.swapCache();

        // Force the page to reload to get the updated version
        window.location.reload();
    },

    error: function(e) {
        $("#sync-status").text("Error caching.");
    }
});

var SelectionCanvas = function(options) {
    this.el = options.el;
    this.$el = $(options.el);

    this.ctx = this.el.getContext("2d");

    this.width = options.width || window.innerWidth;
    this.height = options.height || window.innerHeight;

    // TODO: Better handle toolbar height
    this.height -= 40;

    this.aspect = this.getAspect(this.width, this.height);

    this.el.width = this.width;
    this.el.height = this.height;

    this.points = [];
    this.curImage = null;
    this.rotated = false;

    this.bind();
};

SelectionCanvas.prototype = {
    bind: function() {
        var self = this;
        var down = false;

        this.$el.on({
            "vmousedown": function() {
                down = true;
            },

            "vmousedown vmousemove": function(e) {
                if (!down) {
                    return;
                }

                var point = {
                    x: e.clientX,
                    y: e.clientY
                };

                if (self.points.length >= 2) {
                    self.updateClosestPoint(point);
                } else {
                    self.points.push(point);
                }

                self.drawPoints();
            },

            "vmouseup": function() {
                down = false;
            }
        });
    },

    resetImage: function() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        this.points = [];
        this.curImage = null;
        this.rotated = false;
    },

    loadImage: function(file, callback) {
        var self = this;

        this.resetImage();

        var $img = $("<img>")
            .attr("src", file)
            .hide()
            .on({
                load: function() {
                    self.rotated = (self.getAspect(this.width, this.height) !==
                        self.aspect);
                    self.drawImage();
                    callback();
                },

                error: function() {
                    callback({error: "Error loading image."});
                }
            })
            .appendTo("body");

        this.curImage = $img[0];
    },

    drawImage: function() {
        var ctx = this.ctx;
        var width = this.width;
        var height = this.height;

        ctx.clearRect(0, 0, width, height);

        ctx.save();

        if (this.rotated) {
            ctx.translate(width, 0);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(this.curImage, 0, 0, height, width);
        } else {
            ctx.drawImage(this.curImage, 0, 0, width, height);
        }

        ctx.restore();
    },

    drawPoints: function() {
        var ctx = this.ctx;
        var points = this.points;
        var width = this.width;
        var height = this.height;

        this.drawImage();

        if (points.length === 2) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
            var top = Math.min(points[0].y, points[1].y);
            var right = Math.max(points[0].x, points[1].x);
            var bottom = Math.max(points[0].y, points[1].y);
            var left = Math.min(points[0].x, points[1].x);
            ctx.fillRect(0, 0, width, top);
            ctx.fillRect(right, top, width - right, bottom - top);
            ctx.fillRect(0, bottom, width, height - bottom);
            ctx.fillRect(0, top, left, bottom - top);

            ctx.beginPath();
            ctx.lineWidth = "3";
            ctx.setLineDash([5]);
            ctx.strokeStyle = "rgb(0, 0, 0)";
            ctx.strokeRect(points[0].x, points[0].y,
                points[1].x - points[0].x, points[1].y - points[0].y);
            ctx.stroke();
            ctx.fill();
            ctx.closePath();
        }

        points.forEach(function(point) {
            ctx.fillStyle = "rgb(255, 0, 0)";
            ctx.fillRect(point.x - 5, point.y - 5, 10, 10);
        });
    },

    updateClosestPoint: function(newPoint) {
        var self = this;
        var closest;
        var closestDist = Number.MAX_VALUE;

        this.points.forEach(function(point) {
            var newDist = self.dist(point, newPoint);
            if (newDist < closestDist) {
                closest = point;
                closestDist = newDist;
            }
        });

        closest.x = newPoint.x;
        closest.y = newPoint.y;
    },

    computeSlice: function() {
        var img = this.curImage;
        var points = this.points;
        var width = this.width;
        var height = this.height;

        if (points.length < 2) {
            return {
                x: 0,
                y: 0,
                width: img.width,
                height: img.height
            };
        }

        var a = {x: points[0].x, y: points[0].y};
        var b = {x: points[1].x, y: points[1].y};

        var wRatio = width / height;
        var hRatio = height / width;
        var wScale = img.width / width;
        var hScale = img.height / height;

        // Switch the points back to their original position
        if (this.rotated) {
            var tmp = a.x;
            a.x = a.y / hRatio;
            a.y = (width - tmp) / wRatio;

            tmp = b.x;
            b.x = b.y / hRatio;
            b.y = (width - tmp) / wRatio;
        }

        var x = [Math.round(a.x * wScale), Math.round(b.x * wScale)];
        var y = [Math.round(a.y * hScale), Math.round(b.y * hScale)];

        return {
            x: Math.min.apply(Math, x),
            y: Math.min.apply(Math, y),
            width: Math.max.apply(Math, x) - Math.min.apply(Math, x),
            height: Math.max.apply(Math, y) - Math.min.apply(Math, y)
        };
    },

    getAspect: function(w, h) {
        return w > h ? "landscape" : "portrait";
    },

    dist: function(a, b) {
        return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    }
};

var Selections = function() {
    this.toSave = {};

    this.saving = false;
    this.cacheKey = "crop-data";

    this.loadCache();
};

Selections.prototype = {
    loadCache: function() {
        this.toSave = JSON.parse(localStorage[this.cacheKey] || "{}");
    },

    saveCache: function() {
        localStorage[this.cacheKey] = JSON.stringify(this.toSave);
    },

    start: function(file) {
        this.curFile = file;
        this.startTime = (new Date).getTime();
    },

    finish: function(selection) {
        this.toSave[this.curFile] = {
            selections: [selection],
            started: this.startTime,
            completed: (new Date).getTime()
        };

        this.curFile = this.startTime = undefined;

        this.saveCache();
        this.save();
    },

    save: function() {
        var self = this;

        if (this.saving || !navigator.onLine) {
            return;
        }

        var toSave = {};
        var hasData = false;

        for (var prop in this.toSave) {
            hasData = true;
            toSave[prop] = this.toSave[prop];
        }

        if (!hasData) {
            return;
        }

        this.saving = true;
        $(this).trigger("saving");

        $.ajax({
            type: "POST",
            url: "/selections",
            contentType: "application/json",
            dataType: "json",
            data: JSON.stringify({
                selections: toSave
            }),
            timeout: 8000,

            complete: function() {
                self.saving = false;
            },

            success: function(data) {
                if (data.error) {
                    if (data.login) {
                        loginRedirect();
                    } else {
                        $(self).trigger("error");
                    }
                } else {
                    // Remove the saved items from the queue
                    for (var prop in toSave) {
                        delete self.toSave[prop];
                    }

                    self.saveCache();

                    $(self).trigger("saved", {
                        saved: toSave,
                        result: data
                    });
                }
            },

            error: function() {
                $(self).trigger("error");
            }
        });
    }
};

var FileQueue = function() {
    this.loading = false;
    this.cacheKey = "crop-file-queue";
    this.queue = [];
    this.loadFromCache();
};

FileQueue.prototype = {
    loadFromCache: function() {
        this.queue = JSON.parse(localStorage[this.cacheKey] || "[]");
    },

    saveToCache: function() {
        localStorage[this.cacheKey] = JSON.stringify(this.queue);
    },

    latest: function() {
        for (var i = 0; i < this.queue.length; i++) {
            if (!this.queue[i].done) {
                return this.queue[i];
            }
        }
    },

    markDone: function() {
        var latest = this.latest();

        if (latest) {
            latest.done = true;
            this.saveToCache();
        }
    },

    loadData: function(data) {
        this.queue = data;
        this.saveToCache();
    },

    getQueue: function(callback) {
        var self = this;

        if (this.loading || !navigator.onLine) {
            callback(null, self.queue);
            return;
        }

        this.loading = true;

        // Always attempt to get the latest queue if we're online.
        $.ajax({
            type: "GET",
            url: "/queue",
            dataType: "json",
            timeout: 8000,

            success: function(data) {
                self.loading = false;

                if (data.error) {
                    if (data.login) {
                        loginRedirect();
                    }
                } else {
                    self.loadData(data.images);
                    callback(null, self.queue);
                }
            },

            error: function() {
                self.loading = false;
                callback({error: "Error retreiving file queue."}, self.queue);
            }
        });
    }
};
