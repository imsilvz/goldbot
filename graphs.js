import fs from 'fs';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

// initialize database object
import { db } from './database.js';

const chartJSNodeCanvas = new ChartJSNodeCanvas({
    type: 'png',
    width: 600,
    height: 300
});

const GetWeeklyImage = async() => {
    // fetch price data
    const maxDateData = await db.get(`
        SELECT 
            strftime("%Y-%m-%d", datetime(timestamp/1000, "unixepoch")) AS date
        FROM history
        ORDER BY timestamp DESC
    `);
    const maxDate = new Date(Date.parse(maxDateData.date));
    const priceData = (await db.all(`
        SELECT 
            strftime("%Y-%m-%d", datetime(timestamp/1000, "unixepoch")) AS date,
            CAST(strftime("%H", datetime(timestamp/1000, "unixepoch")) AS integer) / 4 AS bucket,
            min(price) AS price
        FROM history
        GROUP BY 
            strftime("%Y-%m-%d", datetime(timestamp/1000, "unixepoch")),
            CAST(strftime("%H", datetime(timestamp/1000, "unixepoch")) AS integer) / 4
        ORDER BY timestamp DESC
    `));
    
    // map for easier access
    const priceMap = new Map();
    for(let i=0; i<priceData.length; i++) {
        let row = priceData[i];
        priceMap.set(`${row.date}-${row.bucket}`, row);
    }

    // past week
    let priceLabels = [];
    let priceDataSet = [];
    for(let i=1; i<=7; i++) {
        let currDate = new Date(maxDate);
        currDate.setDate(currDate.getDate()-(7-i));
        // 5 time buckets, 1 per 4 hours
        for(let j=0; j<5; j++) {
            let item = priceMap.get(`${currDate.toISOString().split('T')[0]}-${j}`);
            if(item) {
                priceDataSet.push(item.price);
            } else {
                priceDataSet.push(null);
            }
            if(j == 2) {
                priceLabels.push(currDate.toISOString().split('T')[0]);
            } else {
                priceLabels.push("");
            }
        }
    }
    
    const data = {
        labels: priceLabels,
        datasets: [{
            label: 'Weekly History',
            data: priceDataSet,
            fill: false,
            borderColor: 'rgb(175, 82, 191)',
            tension: 0.1
        }]
    };

    const config = {
        type: 'line',
        data: data,
        plugins: [
            {
                id: 'background_color',
                beforeDraw: (chart) => {
                    const { ctx } = chart;
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-over';
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                }
            }
        ],
        options: {
            plugins: {
                title: {
                    display: true,
                    text: "Daily Price History (past 7 days)",
                },
                legend: {
                    display: false,
                }
            },
            scales: {
                x: {
                    ticks: {
                        autoSkip: false,
                        maxRotation: 0,
                        color: 'black',
                    },
                    title: {
                        display: true,
                        text: 'All dates captured in Coordinated Universal Time (UTC)',
                        color: 'black'
                    }
                },
                y: {
                    ticks: {
                        color: 'black',
                    }
                }
            }
        }
    };
    return await chartJSNodeCanvas.renderToBuffer(config);
}

const GetDailyImage = async () => {
    // fetch price data
    const priceData = (await db.all(`
        SELECT 
            strftime("%Y-%m-%d %H", datetime(timestamp/1000, "unixepoch")) AS date,
            min(price) AS price
        FROM history
        GROUP BY strftime("%Y-%m-%d %H", datetime(timestamp/1000, "unixepoch"))
        ORDER BY timestamp DESC
        LIMIT 25;
    `)).reverse();

    const currHour = new Date().getHours();
    const labels = Array.apply(null, Array(priceData.length)).map((x, idx) => {
        let date = null;
        if ((currHour + 24 - idx) / 24 < 1) {
            date = new Date(new Date() - 86400000);
        } else {
            date = new Date();
        }
    
        let year = date.getFullYear();
        let month = (date.getMonth() + 1).toString().padStart(2, '0');
        let day = date.getDate().toString().padStart(2, '0');
        return `${((currHour + 24 - idx) % 24).toString().padStart(2, '0')}:00;${month}/${day}/${year}`;
    }).reverse();

    const data = {
        labels: labels,
        datasets: [{
            label: 'Daily History',
            data: Array.apply(null, Array(priceData.length)).map((x, idx) => {
                return priceData[idx].price;
            }),
            fill: false,
            borderColor: 'rgb(175, 82, 191)',
            tension: 0.1
        }]
    };
    
    const config = {
        type: 'line',
        data: data,
        plugins: [
            {
                id: 'background_color',
                beforeDraw: (chart) => {
                    const { ctx } = chart;
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-over';
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                }
            }
        ],
        options: {
            plugins: {
                title: {
                    display: true,
                    text: "Hourly Price History (past 24 hours)",
                },
                legend: {
                    display: false,
                }
            },
            scales: {
                x: {
                    ticks: {
                        autoSkip: false,
                        callback: function (label) {
                            let realLabel = this.getLabelForValue(label)
                            var hour = realLabel.split(";")[0];
                            return hour;
                        },
                        color: 'black',
                    }
                },
                x2: {
                    type: 'category',
                    position: 'bottom',
                    grid: {
                        display: false,
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 0,
                        crossAlign: 'center',
                        callback: function(label) {
                            let indexOne = Math.floor((priceData.length - currHour) / 2) - 1;
                            let indexTwo = Math.floor(currHour / 2) + (priceData.length - currHour) - 1;
                            let realLabel = this.getLabelForValue(label);
                            var date = realLabel.split(";")[1];

                            // if one of the labels is off the chart, center the day
                            if(indexOne < 0 || indexOne > priceData.length) {
                                indexTwo = Math.floor(priceData.length / 2) - 1;
                            }
                            if(indexTwo < 0 || indexTwo > priceData.length) {
                                indexOne = Math.floor(priceData.length / 2) - 1;
                            }

                            if(label == indexOne || label == indexTwo) {
                                return date;
                            }
                            return "";
                        },
                        color: 'black',
                    }
                },
                y: {
                    ticks: {
                        color: 'black',
                    }
                }
            }
        }
    };
    return await chartJSNodeCanvas.renderToBuffer(config);
}
export { GetDailyImage, GetWeeklyImage };