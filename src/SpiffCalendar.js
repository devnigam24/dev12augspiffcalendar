/*
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
// ======================================================================
// Utilities.
// ======================================================================
// Object.getPrototypeOf is broken in IE :-(. Rough attempt of a workaround:
if (!Object.getPrototypeOf) {
    if (typeof this.__proto__ === "object") {
        Object.getPrototypeOf = function (obj) {
            return obj.__proto__;
        };
    } else {
        Object.getPrototypeOf = function (obj) {
            var constructor = obj.constructor,
            oldConstructor;
            if (Object.prototype.hasOwnProperty.call(obj, "constructor")) {
                oldConstructor = constructor;
                if (!(delete obj.constructor)) // reset constructor
                    return null; // can't delete obj.constructor, return null
                constructor = obj.constructor; // get real constructor
                obj.constructor = oldConstructor; // restore constructor
            }
            return constructor ? constructor.prototype : null; // needed for IE
        };
    }
}

// Base class for adding a signal/event mechanism.
var SpiffCalendarTrackable = function() {
    this._listeners = {
    };

    this.trigger = function(event_name, extra_args) {
        if (!(this._listeners[event_name] instanceof Array))
            return true;
        var listeners = this._listeners[event_name];
        for (var i = 0, len = listeners.length; i < len; i++)
            if (listeners[i].apply(this, extra_args) === false)
                return false;
    };

    this.bind = function(event_name, listener) {
        if (this._listeners[event_name] instanceof Array)
            this._listeners[event_name].push(listener);
        else
            this._listeners[event_name] = [listener];
    };

    this.unbind = function(event_name, listener) {
        if (!(this._listeners[event_name] instanceof Array))
            return;
        this._listeners[event_name] = $.grep(this._listeners[event_name],
                                             function(elem, index) {
            return elem !== listener;
        });
    };
};

var periods = ['One Time', 'Daily', 'Weekly', 'Monthly', 'Annually'];

var weekdays = ['Sunday',
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday'];

var weekdays_short = ['Su',
                      'Mo',
                      'Tu',
                      'We',
                      'Th',
                      'Fr',
                      'Sa'];

var months = ['January',
              'February',
              'March',
              'April',
              'May',
              'June',
              'July',
              'August',
              'September',
              'October',
              'November',
              'December'];

// ======================================================================
// Calendar
// ======================================================================
var SpiffCalendar = function(div, options) {
    this._div = div;
    var that = this;
    var settings = $.extend(true, {
        start: undefined,
        event_renderer: function(e) { return e; },
        add_popup: undefined
    }, options);

    if (this._div.length != 1)
        throw new Error('selector needs to match exactly one element');
    this._div.addClass('SpiffCalendar');

    this._calendar_event = function(date) {
        var html = $(`<div class="event"></div>`);
        html.draggable({
            appendTo: this._div,
            helper: function(e, ui) {
                var original = $(e.target).closest(".ui-draggable");
                return $(this).clone().css({width: original.width()});
            },
            revert: "invalid",
            cursor: "move",
            containment: this._div.find('.calendar'),
            revert: 'invalid',
            revertDuration: 100,
            start: function (e, ui) {
                $(this).hide();
            },
            stop: function (event, ui) {
                $(this).show();
            }
        });
        html.append(settings.event_renderer(date));
        return html;
    };

    this._calendar_day = function(date) {
        var html = $(`
            <td class="day">
                <div class="wrapper">
                    <div class="day_number"></div>
                    <div class="events"></div>
                    <div class="footnote"></div>
                </div>
            </td>`);

        html.find(".day_number").append(date.getDate());
        html.find(".events").append(this._calendar_event("one"));
        html.find(".events").append(this._calendar_event("two"));
        html.find(".footnote").append(settings.footnote_renderer(date.getDate()));

        today = new Date();
        if (date.toDateString() == today.toDateString())
            html.addClass("today");

        return html;
    };

    this._calendar_week = function(range_start, range_end, date) {
        var html = $(`<tr class="week"></tr>`);

        var last = new Date(date);
        last.setDate(date.getDate() + 6);

        while(date <= last){
            var day = this._calendar_day(date);
            if (date < range_start || date > range_end)
                day.addClass("filler");
            html.append(day);
            var newDate = date.setDate(date.getDate() + 1);
            date = new Date(newDate);
        }

        return html;
    };

    this._update = function() {
        this._div.empty();
        this._init();
    };

    this._init = function() {
        this._div.append(`
            <div id="navbar">
                <h2 id="month"></h2>
                <input id="previous" type="button" value="&lt;"/>
                <input id="current" type="button" value="&bull;"/>
                <input id="next" type="button" value="&gt;"/>
            </div>
            <div id="calendar">
                <table>
                    <tr>
                    </tr>
                </table>
            </div>`);
        var table = this._div.find('table');

        $.each(weekdays_short, function(i, val) {
            table.find("tr").append("<th>" + val + "</th>");
        });

        // Default range is current month.
        var today = new Date();
        if (typeof settings.start === "undefined")
            settings.start = new Date(today.getFullYear(), today.getMonth(), 1);
        else
            settings.start = new Date(settings.start.getFullYear(),
                                      settings.start.getMonth(),
                                      1);
        if (typeof settings.last === "undefined"
                || settings.last < settings.start)
            settings.last = new Date(settings.start.getFullYear(),
                                     settings.start.getMonth() + 1,
                                     0);

        // Update navbar text.
        var month_name = months[settings.start.getMonth()];
        var year = settings.start.getFullYear();
        this._div.find("#month").text(month_name + " " + year);

        // Expand the range to start Sunday, end Saturday.
        var thestart = new Date(settings.start.getFullYear(),
                                settings.start.getMonth(),
                                settings.start.getDate());
        thestart.setDate(thestart.getDate() - thestart.getDay());
        var thelast = new Date(settings.last.getFullYear(),
                               settings.last.getMonth(),
                               settings.last.getDate());
        thelast.setDate(thelast.getDate() + 6 - thelast.getDay());

        while(thestart <= thelast) {
            table.append(this._calendar_week(settings.start, settings.last, thestart));
            var newDate = thestart.setDate(thestart.getDate() + 6);
            thestart = new Date(newDate);
        }

        // Connect navbar button events.
        this._div.find("#previous").click(this.to_previous_month);
        this._div.find("#current").click(this.to_today);
        this._div.find("#next").click(this.to_next_month);

        if (settings.add_popup) {
            table.find(".day").qtip({
                content: {
                    text: settings.add_popup
                },
                style: {
                    classes: 'SpiffCalendarPopup qtip-light qtip-shadow',
                    tip: {
                        corner: 'bottom center'
                    }
                },
                show: {
                    event: 'click',
                    solo: true
                },
                hide: {
                    fixed: true,
                    event: 'unfocus'
                },
                position: {
                    my: 'bottom center',
                    target: 'mouse',
                    adjust: {
                        mouse: false
                    }
                }
            });
        }
    };

    this.to_previous_month = function() {
        settings.start = new Date(settings.start.getFullYear(),
                                  settings.start.getMonth()-1, 1);
        settings.last = undefined;
        that._update();
    };

    this.to_today = function() {
        settings.start = new Date();
        settings.start.setDate(1);
        settings.last = undefined;
        that._update();
    };

    this.to_next_month = function() {
        settings.start = new Date(settings.start.getFullYear(),
                                  settings.start.getMonth()+1, 1);
        settings.last = undefined;
        that._update();
    };

    this._init();
};

SpiffCalendar.prototype = new SpiffCalendarTrackable();
