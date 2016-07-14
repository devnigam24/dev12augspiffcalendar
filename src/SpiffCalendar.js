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
        last: undefined,
        event_api: function() { return {}; },
        event_renderer: function(e) { return e; },
        footnote_renderer: function(e) { return e; },
        on_add_event: function() {},
        on_move_event: function() {},
        on_delete_event: function() {},
        event_detail_renderer: function(event_data) {
            var html = $(`
                <div id="popup-detail" class="default-popup" style="display: none">
                    <div>
                        <label for="popup-detail-name">Event: </label>
                        <span id="popup-detail-name"></span>
                    </div>
                    <div>
                        <label for="popup-detail-name">When: </label>
                        <span id="popup-detail-time"></span>
                    </div>
                    <div id="popup-buttons">
                        <button>Delete</button>
                    </div>
                </div>`);
			var time = event_data.time ? event_data.time : 'all day';
			html.find('#popup-detail-name').text(event_data.name);
			html.find('#popup-detail-time').text(time);
            html.find('button').click(function() {
                var popup = $(this).closest('.SpiffCalendarPopup');
                popup.hide();
                settings.on_delete_event(html, event_data, function(data) {
                    that.remove_event(event_data);
                });
            });
            return html;
        },
        event_add_renderer: function() {
            var html = $(`
                <div id="popup-add" class="default-popup" style="display: none">
                    <input id="popup-add-name" type="text" placeholder="Event"/>
                    <div id="popup-buttons">
                        <button>Create</button>
                    </div>
                </div>`);
            html.find('button').click(function() {
                var popup = $(this).closest('.SpiffCalendarPopup');
                var api = popup.qtip('api');
                var date = $(api.elements.target).attr('data-date');
                popup.hide();
                settings.on_add_event(date, html, function(data) {
                    that.add_event(date, data);
                });
            });
            return html;
        },
    }, options);
    var qtip_settings = {
        style: {
            classes: 'SpiffCalendarPopup qtip-light qtip-shadow',
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
            viewport: this._div,
            adjust: {
                mouse: false
            }
        }
    };

    if (this._div.length != 1)
        throw new Error('selector needs to match exactly one element');
    this._div.addClass('SpiffCalendar');

    this._calendar_event = function(event_data) {
        var html = $(`<div class="event"></div>`);
        html.data('event', event_data);
        if (event_data.time)
            html.addClass('timed');

        // Add a popup for viewing event details.
        if (settings.event_detail_renderer) {
            html.qtip($.extend(true, qtip_settings, {
                content: {
                    text: function() { return settings.event_detail_renderer(event_data); }
                },
            }));
            html.click(function() {
                event.stopPropagation();
            });
        }

        // Make events draggable.
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

        // Render the event content.
        html.append(settings.event_renderer(html, event_data));
        return html;
    };

    this.add_event = function(date, event_data) {
        date = date.replace(/-0/g, '-');
        var events = that._div.find('*[data-date="' + date + '"] .events');
        events.append(that._calendar_event(event_data));
    };

    this.remove_event = function(event_data) {
        that._div.find('.event').filter(function() {
            return event_data == $(this).data('event');
        }).remove();
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
        html.droppable({
            accept: function(d) {
                return d.closest('.event').length > 0 && !d.closest('.day').is(this);
            },
            drop: function(e, ui) {
                var event_data = ui.draggable.data('event');
                ui.draggable.remove();
                settings.on_move_event(event_data, $(this).data('date'));
                $(this).find('.events').append(that._calendar_event(event_data));
            }
        });

        var year = date.getFullYear();
        var date_str = year + '-' + (date.getMonth()+1) + '-' + date.getDate();
        html.attr('data-date', date_str);
        html.find(".day_number").append(date.getDate());

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

        // Update the user interface.
        var current_date = new Date(thestart);
        while(current_date <= thelast) {
            var week = this._calendar_week(settings.start,
                                           settings.last,
                                           current_date);
            table.append(week);
            var newDate = current_date.setDate(current_date.getDate() + 6);
            current_date = new Date(newDate);
        }

        // Trigger event refresh.
        settings.event_api(thestart, thelast, function(data) {
            $.each(data, function(index, day_data) {
                var date = day_data.date.replace(/-0/g, '-');
                var day_div = table.find('*[data-date="' + date + '"]');
                var events = day_div.find('.events');
                events.empty();
                $.each(day_data.events, function(index, ev) {
                    events.append(that._calendar_event(ev));
                });
                var footnote = settings.footnote_renderer(day_data.footnote);
                day_div.find(".footnote").append(footnote);
            });
        });

        // Connect navbar button events.
        this._div.find("#previous").click(this.to_previous_month);
        this._div.find("#current").click(this.to_today);
        this._div.find("#next").click(this.to_next_month);

        if (settings.event_add_renderer) {
            table.find(".day").qtip($.extend(true, qtip_settings, {
                events: {
                    visible: function() {
                        $(this).find('input:first').focus();
                    }
                },
                content: {
                    text: settings.event_add_renderer
                }
            }));
            table.find('.day').mousedown(function() {
                table.find('.day').removeClass('active');
                $(this).addClass('active');
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
